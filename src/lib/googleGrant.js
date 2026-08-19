// Connecting Google Photos, once.
//
// The access token lives an hour and lives in sessionStorage, which is
// correct and is also why every new app session began with another trip to
// Google. The thing that fixes it is the refresh token, which Google has
// been issuing all along — connectGooglePhotos asks for access_type=offline
// — and which nothing has ever read.
//
// A refresh token does not expire. It is a standing key to somebody's entire
// photo library, so the one thing this file must never do is keep one where
// a script on the page can read it. It arrives in the browser (that is
// unavoidable; it comes back in the OAuth response), it is handed straight
// to the server, and it is never written down here.
//
// After that the page asks the server for an *access* token and gets an
// hour's worth. The refresh token stays on the other side of the wall.
//
// Pure where it can be: the decisions — is this worth sending, is this
// answer usable, has the grant been withdrawn — are testable without a
// network.

/**
 * Worth handing to the server?
 *
 * Supabase fires onAuthStateChange for ordinary token refreshes too, and
 * those sessions carry no provider fields at all. Sending then would be a
 * request per refresh, all of them empty — and, worse, a server that
 * overwrote a good grant with nothing would break the very thing this
 * exists to fix.
 */
export function worthKeeping(session) {
  const refresh = session?.provider_refresh_token
  return typeof refresh === 'string' && refresh.length > 10
}

/**
 * What the server said, read strictly.
 *
 * An access token that is about to expire is not an access token. Google
 * returns expires_in in seconds; anything under a minute is treated as
 * nothing, because handing it to a thousand-photograph import guarantees a
 * failure a minute later that looks like a scope problem.
 */
export const LEAST_USEFUL_SECONDS = 60

export function usable(said) {
  const token = said?.access_token
  if (typeof token !== 'string' || !token) return null
  const left = Number(said?.expires_in ?? 0)
  if (Number.isFinite(left) && left > 0 && left < LEAST_USEFUL_SECONDS) return null
  return token
}

/**
 * Google has withdrawn the grant, as against the server having a bad day.
 *
 * The distinction is the whole point: a withdrawn grant must be *said* —
 * "your Google connection was withdrawn, connect it again" — and a network
 * failure must not be, because sending somebody back to a consent screen
 * they do not need is how this feature became two taps in the first place.
 *
 * Google says invalid_grant for a refresh token that has been revoked in
 * somebody's account, or has gone six months unused. Anything else is ours.
 */
export function withdrawn(said, status) {
  if (status === 404) return false
  const why = String(said?.error ?? said?.why ?? '')
  return why === 'invalid_grant' || why === 'revoked'
}
