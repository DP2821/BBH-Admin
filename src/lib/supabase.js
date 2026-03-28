import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '⚠️ Supabase URL or Anon Key is missing.\n' +
    'Create a .env file in the admin folder with:\n' +
    '  VITE_SUPABASE_URL=your_supabase_project_url\n' +
    '  VITE_SUPABASE_ANON_KEY=your_supabase_anon_key'
  );
}

// ── Fix: HashRouter + Supabase OAuth hash conflict ──────────────────
// Supabase OAuth redirects with tokens in the hash: #access_token=...
// HashRouter also uses the hash for routing (#/login, #/dashboard).
// When both try to use the hash, Supabase can't detect the tokens.
// This interceptor runs BEFORE the app renders to extract the tokens
// and move them into the URL query string so Supabase can parse them.
let hadAuthParams = false;
if (window.location.hash && window.location.hash.includes('access_token')) {
  const hashContent = window.location.hash.substring(1); // remove the '#'

  // Check if it's Supabase auth tokens (not a HashRouter route)
  if (hashContent.includes('access_token=') && hashContent.includes('token_type=')) {
    console.log('[Supabase] Detected OAuth tokens in hash, converting for session exchange...');
    hadAuthParams = true;

    // Move hash params to query string temporarily so Supabase picks them up
    const newUrl = window.location.pathname + '?' + hashContent;
    window.history.replaceState(null, '', newUrl);
  }
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
