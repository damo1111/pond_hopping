// Where the app actually lives on the web, as opposed to where this copy of
// it happens to be running.
//
// Share links were built from window.location.origin, which is right in a
// browser and right in the Android app — that one is a remote window onto
// pond.eend.app, so its origin *is* the site. On iOS it is not: the app
// bundles its assets and serves them from capacitor://localhost, so the
// share sheet handed people
//
//   capacitor://localhost/?share=china-japan-example&show=journal,flights,map
//
// which is not a URL anybody else's phone can open. The share appeared to
// work — sheet opened, link sent — and the person on the other end got
// something no browser will touch. Worse than an error, because both ends
// think it worked.
//
// Falling back only for non-web schemes rather than hard-coding the site
// keeps preview deployments and localhost sharing their own origin, which
// is what you want when testing a share link on a branch.

/** The canonical public site. The only origin outsiders can open. */
export const SITE = 'https://pond.eend.app'

/**
 * @param loc  something location-shaped; defaults to the real one
 * @returns    an origin safe to put in front of a link you give somebody
 */
export function siteOrigin(loc = globalThis.location) {
  const protocol = loc?.protocol
  // http covers localhost and LAN testing; https covers production and
  // every preview deployment. Anything else — capacitor:, ionic:, file: —
  // is this app talking to itself.
  if ((protocol === 'https:' || protocol === 'http:') && loc.origin) return loc.origin
  return SITE
}
