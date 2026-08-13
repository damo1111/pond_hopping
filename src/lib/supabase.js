import { createClient } from '@supabase/supabase-js'

// Publishable key — safe to ship in the client bundle by design.
// Env vars override for local dev / future projects.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://qslksdgxoibzrisywvqk.supabase.co'
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

/**
 * How long a query may hang before it counts as failed.
 *
 * `fetch` has no timeout of its own. A server that refuses a connection fails
 * in milliseconds, but one whose packets are silently dropped — a corporate
 * filter, a captive portal, a phone that has left wifi without noticing —
 * never answers and never rejects. The promise simply stays pending, and any
 * screen waiting on it waits for the rest of the day.
 *
 * That is not hypothetical: `auth.eend.app` went behind a network that drops
 * rather than refuses, and the app sat on "loading the world…" indefinitely
 * on two devices. Nothing was retrying, nothing was reporting, and there was
 * no way in from the outside to tell a slow network from a broken app.
 *
 * Twenty seconds is far beyond any healthy query here — the slowest is under
 * two — and short enough that somebody staring at a spinner finds out.
 */
const GIVE_UP_MS = 20000

/**
 * Bounded fetch, for the calls that should never take long.
 *
 * Deliberately not applied to storage: a photo upload over hotel wifi is
 * genuinely allowed to take minutes, and a timeout that cancels somebody's
 * upload halfway is a worse bug than the one this fixes. Only PostgREST and
 * auth are bounded, and both are supposed to answer immediately.
 *
 * An AbortController rather than AbortSignal.timeout(): the latter is fine in
 * every browser we support and absent in some older WKWebViews, and this is
 * the layer every single request in the app goes through.
 */
function fetchWithTimeout(input, init = {}) {
  const to = String(typeof input === 'string' ? input : input?.url ?? '')
  const bounded = to.includes('/rest/v1/') || to.includes('/auth/v1/')
  if (!bounded || init.signal) return fetch(input, init)

  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(new Error(`No answer in ${GIVE_UP_MS / 1000}s`)), GIVE_UP_MS)
  return fetch(input, { ...init, signal: stop.signal }).finally(() => clearTimeout(timer))
}

export const supabase = createClient(url, anonKey, { global: { fetch: fetchWithTimeout } })

// Exposed for the rare caller that needs a raw fetch instead of the
// supabase-js client (e.g. streaming an Edge Function response, which
// functions.invoke() can't do — it always awaits the full body).
export const supabaseUrl = url
export const supabaseAnonKey = anonKey
