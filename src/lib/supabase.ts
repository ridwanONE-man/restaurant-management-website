import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Browser-safe Supabase client.
 *
 * Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from `.env` (or Vercel env vars).
 * Falls back to the dozkaproject URL + publishable key, which are public by design —
 * Row Level Security is what protects the data.
 *
 * The service role key must NEVER be imported into the React app.
 */

const FALLBACK_URL = 'https://twtlooguletamwqmmyoy.supabase.co'
const FALLBACK_KEY = 'sb_publishable_R28kT5RlET9gpfnDX9RhcQ_MnUuBPxV'

const url = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim() || FALLBACK_URL
const anonKey =
  ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim() || FALLBACK_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 20 },
  },
})

export function getSupabase(): SupabaseClient {
  return supabase
}

/** Unique id for this browser tab — lets a device ignore realtime echoes of its own writes */
export const CLIENT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const supabaseConfig = { url }
