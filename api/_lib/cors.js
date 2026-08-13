// Letting the wrapped apps talk to their own API.
//
// The web build serves /api/* same-origin, so none of this applies to it and
// none of it was ever noticed. Inside Capacitor there is no `server.url` in
// capacitor.config.json, so the app runs from `capacitor://localhost` with
// the assets bundled — and every call to https://pond.eend.app/api/* is
// cross-origin.
//
// ── Why GETs worked and nothing else did ─────────────────────────────────
//
// A GET with no unusual headers is a *simple request*: the browser sends it
// and only checks the answer, and `Access-Control-Allow-Origin: *` in
// vercel.json was enough. Every successful API call ever made from the iOS
// build is one of those — sixteen of them, all `explore-photo`,
// `place-enrich` and `explore-search`.
//
// A POST carrying `Content-Type: application/json` is not simple. The
// browser sends an OPTIONS preflight first and will not send the real
// request unless that preflight comes back with:
//
//   - a 2xx status, and
//   - `Access-Control-Allow-Headers` covering every header being sent.
//
// Production had neither. Verified against the live site: the response
// carries `access-control-allow-origin: *` and no allow-headers or
// allow-methods at all, and no handler in api/ answers OPTIONS — they all
// fall through to `405 POST only`, which fails a preflight on status alone.
//
// The failure has no status and no body. The browser refuses before sending
// anything, `fetch` rejects, and the app says "Load failed" — which is why
// this looked like a network problem for as long as it did. It is recorded
// as `0 from /api/plan-chat`, and 0 is the tell: there was never a response
// to have a status.
//
// ── Both halves are needed ───────────────────────────────────────────────
//
// vercel.json now sends the allow-headers and allow-methods. That alone is
// not enough, because the preflight would still meet a 405. This is the
// other half: answer OPTIONS, early, with nothing.

/**
 * Answer a CORS preflight and say whether that is all this request was.
 *
 * First line of every handler that accepts anything but a plain GET:
 *
 *     if (preflight(req, res)) return
 *
 * 204 rather than 200: there is no body, and saying so is the difference
 * between a preflight and an answer.
 */
export function preflight(req, res) {
  if (req.method !== 'OPTIONS') return false
  // The headers themselves come from vercel.json so that they are on every
  // response including the real one — a preflight that passes and a POST
  // whose *answer* is then refused is the same failure one step later.
  res.status(204).end()
  return true
}
