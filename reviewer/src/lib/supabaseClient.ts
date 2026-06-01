import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// A simple helper to check if Supabase is properly configured with real keys
export const isSupabaseConfigured =
  supabaseUrl.trim() !== '' &&
  supabaseUrl !== 'https://your-project-id.supabase.co' &&
  supabaseAnonKey.trim() !== '' &&
  supabaseAnonKey !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// Real Supabase Client or null
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase environment variables are missing or use placeholders. The application is running in client-only local mock fallback mode.',
  );
}
