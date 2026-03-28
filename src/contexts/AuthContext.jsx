import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only use onAuthStateChange — it fires INITIAL_SESSION automatically,
    // so we do NOT need a separate getSession() call.
    // Having both causes a race condition where loading flickers.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log('[Auth] Event:', event, 'Session:', !!newSession);

      setSession(newSession);

      if (newSession?.user) {
        // Use setTimeout to avoid Supabase deadlock when calling
        // Supabase functions inside onAuthStateChange callback
        setTimeout(() => {
          fetchProfile(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    try {
      console.log('[Auth] Fetching profile for:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist yet — will be created by DB trigger
        // Wait a moment and retry once
        console.log('[Auth] Profile not found, retrying in 2s...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const { data: retryData, error: retryError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (retryError) {
          console.error('[Auth] Profile retry failed:', retryError);
        }
        setProfile(retryData || null);
      } else if (error) {
        console.error('[Auth] Profile fetch error:', error);
        setProfile(null);
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error('[Auth] Unexpected error fetching profile:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/BBH-Admin',
      },
    });
    if (error) console.error('[Auth] Login error:', error);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('[Auth] Logout error:', error);
    setSession(null);
    setProfile(null);
  }

  const isAdmin = profile?.role === 'admin';

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    isAdmin,
    signInWithGoogle,
    signOut,
    refreshProfile: () => session?.user && fetchProfile(session.user.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
