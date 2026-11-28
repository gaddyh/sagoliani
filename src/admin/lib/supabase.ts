import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

// The anon key is public by design — every security boundary lives in RLS
// and the SECURITY DEFINER RPCs. The service key never reaches the browser.
export const supabase = createClient(
  url ?? 'http://127.0.0.1:54321',
  anonKey ?? 'missing-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
)
