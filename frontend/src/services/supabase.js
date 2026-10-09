import { createClient } from '@supabase/supabase-js';
import { isPublicSupabaseKey } from './publicConfiguration';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configurationError = !url || !isPublicSupabaseKey(key)
  ? 'Configure a conexão Supabase conforme frontend/.env.example.'
  : null;
export const supabase = configurationError ? null : createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
