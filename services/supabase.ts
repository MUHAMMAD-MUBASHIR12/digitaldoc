import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env.local'
  );
}

// Vite HMR re-evaluates this module on hot-reload, which would call
// createClient() a second time and trigger the "Multiple GoTrueClient
// instances" warning. Storing on globalThis ensures HMR re-runs reuse
// the same instance that already holds the active auth session.
type SupabaseInstance = ReturnType<typeof createClient>;
const _g = globalThis as Record<string, unknown>;
if (!_g.__supabase__) {
  _g.__supabase__ = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

export const supabase = _g.__supabase__ as SupabaseInstance;
