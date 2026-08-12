// A promise that is guaranteed to settle.
//
// The screen that gates everything else must not be able to wait forever, and
// on 12 August it did: two devices sat on "loading the world…" indefinitely
// because the API host had gone behind a network that drops packets rather
// than refusing them. Nothing timed out, nothing retried visibly, nothing was
// written down, and from the outside it was indistinguishable from the app
// being broken.
//
// ── Why this exists as well as the timeout in supabase.js ────────────────
//
// That one bounds the *socket*, and it works — measured against a server that
// accepts a connection and never answers, the underlying fetch rejects on
// schedule with "No answer in 20s".
//
// The promise supabase-js hands back does not settle when it does. Another
// round of the same requests goes out twenty seconds later, so something
// under the client retries rather than surfacing the failure, and the caller
// is still waiting. Whatever the library is doing there, a loading screen
// should not depend on it: the component asked a question and needs an answer
// or an apology, and this is the layer that can promise one.
//
// So both. The socket timeout stops connections piling up; this stops the UI
// from ever being the thing that waits.

/** Long enough for any healthy query — the slowest here is under two
 *  seconds — and short enough that somebody staring at a spinner finds out
 *  rather than deciding the app is broken and leaving. */
export const PATIENCE_MS = 20000

/**
 * Settle either way, but settle.
 *
 * Resolves with whatever the promise gives — including a `{ data, error }`
 * pair, which is what supabase-js resolves with and is passed through
 * untouched. If nothing arrives in time, rejects with a plain Error rather
 * than resolving with a made-up empty result: a caller must be able to tell
 * "there is nothing" from "we never found out", and the whole failure this
 * was written for came from a screen that could not.
 *
 * The loser of the race is not cancelled. It cannot be — a thenable is not
 * abortable from out here — and it does not need to be: the socket underneath
 * has its own bound in supabase.js, and a late answer arriving after the
 * caller has given up is dropped by the caller's own `alive` check.
 */
export function within(promise, ms = PATIENCE_MS, what = 'the server') {
  let timer
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, no) => {
      timer = setTimeout(() => no(new Error(`No answer from ${what} in ${Math.round(ms / 1000)}s`)), ms)
    }),
  ])
}
