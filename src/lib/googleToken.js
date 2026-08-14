// Google's access token, and nowhere else.
//
// This lived in google.js, which reaches the Supabase client at module scope
// — so anything wanting to stash a token had to import a module that cannot
// load outside a browser. backFromTheBrowser did exactly that, inside a
// try/catch, on the one path where the token arrives. In Node it threw and
// was swallowed; in a browser it worked. A silent failure that is invisible
// in tests and load-bearing in production is not a dependency worth having
// for four lines of storage.
//
// Supabase surfaces provider_token only in the instant after an OAuth round
// trip and never persists it, so it has to be written down somewhere.
// sessionStorage rather than local: a Google token is good for an hour, and
// one lying about in localStorage a week later is a worse answer than none.

export const KEY = 'pond.google.token'

/** Takes a session, or anything else carrying a provider_token. */
export function rememberGoogleToken(session) {
  const token = session?.provider_token
  // Guarded, because onAuthStateChange fires for token refreshes too and
  // those sessions carry no provider token. Writing then would clear a good
  // one an hour into an import.
  if (!token) return false
  try {
    globalThis.sessionStorage?.setItem(KEY, token)
    return true
  } catch {
    // Private mode. The token still lives in memory for this page.
    return false
  }
}

export function getGoogleToken() {
  try {
    return globalThis.sessionStorage?.getItem(KEY) || null
  } catch {
    return null
  }
}

export function clearGoogleToken() {
  try {
    globalThis.sessionStorage?.removeItem(KEY)
  } catch {
    /* nothing to do and nothing worth saying */
  }
}
