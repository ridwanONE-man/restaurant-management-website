import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Browser-safe Supabase client (URL + anon key from `.env`).
 * Fill `.env` then restart the dev server.
 *
 * Service role key stays in `.env` as SUPABASE_SERVICE_ROLE_KEY
 * and must never be imported into the React app.
 */

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

export const isSupabaseConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, then restart npm run dev.',
    )
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
  return client
}

/** Optional helper — returns null when keys are still empty */
export function tryGetSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  return getSupabase()
}

export const supabaseConfig = {
  url,
  hasAnonKey: Boolean(anonKey),
  /** Service role is never available in the browser build */
  serviceRoleNote:
    'SUPABASE_SERVICE_ROLE_KEY is for admin/server use only (Edge Functions, scripts). Keep it out of VITE_ variables.',
}
