-- =====================================================
-- BBH Admin — Supabase Database Migration
-- =====================================================
-- Run this SQL in Supabase Dashboard → SQL Editor
-- This creates all tables, RLS policies, and triggers
-- =====================================================

-- =====================================================
-- 1. PROFILES TABLE
-- Stores user profile data synced from Google SSO
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies: Everyone can read, users can update their own, admins can update any
CREATE POLICY "Anyone can view profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Allow insert for new profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (true);


-- =====================================================
-- 2. WORKS TABLE
-- Temple works created by admin
-- =====================================================
CREATE TABLE IF NOT EXISTS public.works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  work_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  people_required INT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

-- Everyone can read works
CREATE POLICY "Anyone can view works"
  ON public.works FOR SELECT
  USING (true);

-- Only admins can create works
CREATE POLICY "Admins can create works"
  ON public.works FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can update works
CREATE POLICY "Admins can update works"
  ON public.works FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete works
CREATE POLICY "Admins can delete works"
  ON public.works FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- =====================================================
-- 3. ASSIGNMENTS TABLE
-- Links users to works
-- =====================================================
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed', 'cancelled')),
  has_overlap BOOLEAN DEFAULT FALSE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES public.profiles(id),
  UNIQUE(work_id, user_id)
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Users can see their own assignments, admins can see all
CREATE POLICY "Users see own assignments"
  ON public.assignments FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can create assignments
CREATE POLICY "Admins can create assignments"
  ON public.assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can update assignments
CREATE POLICY "Admins can update assignments"
  ON public.assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete assignments
CREATE POLICY "Admins can delete assignments"
  ON public.assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- =====================================================
-- 4. AVAILABILITY REQUESTS TABLE
-- Users request to be available for work
-- =====================================================
CREATE TABLE IF NOT EXISTS public.availability_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

ALTER TABLE public.availability_requests ENABLE ROW LEVEL SECURITY;

-- Users see their own, admins see all
CREATE POLICY "Users see own requests"
  ON public.availability_requests FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can create requests
CREATE POLICY "Users can create requests"
  ON public.availability_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only admins can update requests (approve/reject)
CREATE POLICY "Admins can update requests"
  ON public.availability_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- =====================================================
-- 5. AUTO-CREATE PROFILE ON SIGNUP (TRIGGER)
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    'user'
  );
  RETURN NEW;
END;
$$;

-- Drop the trigger if it exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- =====================================================
-- 6. OVERLAP DETECTION FUNCTION
-- Call this to check overlaps for a user
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_user_overlaps(target_user_id UUID)
RETURNS TABLE (
  assignment_id_1 UUID,
  work_title_1 TEXT,
  assignment_id_2 UUID,
  work_title_2 TEXT,
  overlap_date DATE
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    a1.id AS assignment_id_1,
    w1.title AS work_title_1,
    a2.id AS assignment_id_2,
    w2.title AS work_title_2,
    w1.work_date AS overlap_date
  FROM public.assignments a1
  JOIN public.works w1 ON a1.work_id = w1.id
  JOIN public.assignments a2 ON a1.user_id = a2.user_id
  JOIN public.works w2 ON a2.work_id = w2.id
  WHERE a1.user_id = target_user_id
    AND a1.id < a2.id
    AND a1.status != 'cancelled'
    AND a2.status != 'cancelled'
    AND w1.work_date = w2.work_date
    AND w1.start_time < w2.end_time
    AND w2.start_time < w1.end_time;
$$;


-- =====================================================
-- 7. MAKE FIRST USER ADMIN (OPTIONAL)
-- =====================================================
-- After you sign in for the first time, run this to
-- make yourself an admin (replace YOUR_EMAIL):
--
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE email = 'your.email@gmail.com';
-- =====================================================

-- Done! 🎉
