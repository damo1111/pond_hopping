import { createClient } from '@supabase/supabase-js'

// Publishable key — safe to ship in the client bundle by design.
// Env vars override for local dev / future projects.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://qslksdgxoibzrisywvqk.supabase.co'
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

export const supabase = createClient(url, anonKey)

// Exposed for the rare caller that needs a raw fetch instead of the
// supabase-js client (e.g. streaming an Edge Function response, which
// functions.invoke() can't do — it always awaits the full body).
export const supabaseUrl = url
export const supabaseAnonKey = anonKey
