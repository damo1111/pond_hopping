// Where the app is about to send somebody, read from an answer.
//
// Its own file with no imports, because google.js reaches supabase.js at
// module scope and cannot be loaded outside a browser — so nothing in it can
// be tested, which is how the bug below shipped.
//
// ── The bug ──────────────────────────────────────────────────────────────
//
// callApi hands back the raw Response, and a Response carries its own `url`:
// the address it was fetched from. `said.url` was therefore truthy, passed
// the guard, and the app navigated to its own API endpoint. The service
// worker answered that with the app shell, so the whole thing looked like a
// reload — "checking with Google", then the app again, no error anywhere.

/**
 * The consent address, or null.
 *
 * Two checks rather than one. Reading the body instead of the Response is the
 * fix; insisting the result is a Google address is the guard that would have
 * caught it anyway, and catches every other way a wrong URL could arrive
 * here. Somewhere this app is about to *navigate to* is worth being certain
 * about — the failure is silent and self-inflicted.
 */
export async function consentUrl(res) {
  if (!res?.ok || typeof res.json !== 'function') return null
  const said = await res.json().catch(() => null)
  const url = said?.url
  if (typeof url !== 'string') return null
  return /^https:\/\/accounts\.google\.com\//.test(url) ? url : null
}
