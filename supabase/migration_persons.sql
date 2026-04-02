-- =====================================================
-- BBH Admin — Persons & PDF Import Migration
-- =====================================================
-- Run this SQL in Supabase Dashboard → SQL Editor
-- AFTER running the original migration.sql
-- =====================================================

-- =====================================================
-- 1. PERSONS TABLE
-- Stores people imported from PDF committee data.
-- These people may not have logged in (no Google auth).
-- Admin can map them to a profile once they login.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  mobile TEXT,
  village TEXT,
  mapped_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safety: ensure updated_at exists even if table was created earlier
ALTER TABLE public.persons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Enable RLS
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

-- Everyone can read persons
CREATE POLICY "Anyone can view persons"
  ON public.persons FOR SELECT
  USING (true);

-- Only admins can create persons
CREATE POLICY "Admins can create persons"
  ON public.persons FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can update persons
CREATE POLICY "Admins can update persons"
  ON public.persons FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete persons
CREATE POLICY "Admins can delete persons"
  ON public.persons FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- =====================================================
-- 2. MODIFY ASSIGNMENTS TABLE
-- Allow person_id alongside user_id.
-- user_id becomes nullable for PDF-imported assignments.
-- =====================================================

-- Add person_id column
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES public.persons(id) ON DELETE SET NULL;

-- Make user_id nullable (it was NOT NULL before)
ALTER TABLE public.assignments
  ALTER COLUMN user_id DROP NOT NULL;

-- Ensure at least one identity is set
ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignment_has_identity;
ALTER TABLE public.assignments
  ADD CONSTRAINT assignment_has_identity
  CHECK (user_id IS NOT NULL OR person_id IS NOT NULL);

-- Drop the old unique constraint and create a new one
-- that handles both user_id and person_id
ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_work_id_user_id_key;

-- Create unique index for work + user (when user_id is set)
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_work_user
  ON public.assignments(work_id, user_id)
  WHERE user_id IS NOT NULL;

-- Create unique index for work + person (when person_id is set)
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_work_person
  ON public.assignments(work_id, person_id)
  WHERE person_id IS NOT NULL;


-- =====================================================
-- 2b. MAKE WORKS COLUMNS NULLABLE
-- Allow importing committees without date/time set yet.
-- Admin can fill these in later.
-- =====================================================
ALTER TABLE public.works
  ALTER COLUMN work_date DROP NOT NULL;

ALTER TABLE public.works
  ALTER COLUMN start_time DROP NOT NULL;

ALTER TABLE public.works
  ALTER COLUMN end_time DROP NOT NULL;


-- =====================================================
-- 3. PDF IMPORTS TABLE (tracks import history)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pdf_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  work_title TEXT,
  work_date DATE,
  persons_imported INT DEFAULT 0,
  assignments_created INT DEFAULT 0,
  imported_by UUID REFERENCES public.profiles(id),
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pdf_imports ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage import history
CREATE POLICY "Admins can view imports"
  ON public.pdf_imports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can create imports"
  ON public.pdf_imports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- =====================================================
-- 4. FUNCTION: Map person to profile
-- Merges a person with a logged-in user's profile
-- =====================================================
CREATE OR REPLACE FUNCTION public.map_person_to_profile(
  target_person_id UUID,
  target_profile_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the person's mapped_profile_id
  UPDATE public.persons
  SET mapped_profile_id = target_profile_id,
      updated_at = NOW()
  WHERE id = target_person_id;

  -- Update all assignments for this person to also reference the profile
  UPDATE public.assignments
  SET user_id = target_profile_id
  WHERE person_id = target_person_id
    AND (user_id IS NULL OR user_id != target_profile_id);
END;
$$;

-- Done! 🎉
