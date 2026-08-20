// Every endpoint in this app lives under /api/, and the path must say so.
//
// Its own file with no imports, because apiBase.js reaches @capacitor/core
// and analytics.js — which reaches supabase.js, which reads import.meta.env
// at module scope — so nothing in it can be loaded outside a browser, and
// therefore nothing in it was ever tested. That is the same reason the last
// bug shipped, and putting this guard in there would have made it untestable
// for exactly the same reason.
//
// ── The bug it exists for ────────────────────────────────────────────────
//
// Wrapped in Capacitor, API_BASE is an origin with no trailing slash, so a
// bare name concatenates straight onto it: 'google-connect' became
// https://pond.eend.appgoogle-connect. DNS fails and WebKit reports "Load
// failed". On the web the identical bare name resolves relative to the
// current page and 404s instead — one mistake with two different symptoms,
// which is how it survived on both platforms at once and was diagnosed as
// neither.
//
// Two call sites had it. One was the write that stores a Google refresh
// token, so that request had never once reached the server — which is the
// entire reason google_grants sat empty for a month while Supabase took the
// blame.

/**
 * The path, or a throw.
 *
 * Deliberately not "prefix it if it is missing". A path that is wrong here is
 * wrong at the call site, and quietly correcting it would hide the next one
 * exactly as the last one was hidden.
 */
export function checkedPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    throw new Error(`callApi needs a /api/… path, got ${JSON.stringify(path)}`)
  }
  return path
}

/**
 * The header that says who is asking, or nothing.
 *
 * Endpoints that act on somebody's behalf — the Google grant, the connect
 * flow — identify the caller from `Authorization`, and callApi has never
 * attached one: every caller that needs it builds it by hand, and the three
 * I wrote did not. So each would have answered 401 even once its path was
 * right, which is a second invisible failure stacked on the first.
 *
 * Nothing rather than an empty Bearer when there is no session. An
 * `Authorization: Bearer ` header is a malformed credential and gets a 401
 * with a different reason attached; no header at all is the honest statement
 * that nobody is signed in.
 */
export function authHeader(session) {
  const token = session?.access_token
  return typeof token === 'string' && token ? { Authorization: `Bearer ${token}` } : {}
}
