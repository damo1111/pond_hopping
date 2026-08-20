import { Capacitor } from '@capacitor/core'
import { apiFailed, tookMs } from './analytics.js'
import { checkedPath } from './apiPath.js'

// The web build serves /api/* same-origin, so a relative path just works.
// Wrapped in Capacitor, the app runs from capacitor://localhost (iOS) or
// http://localhost (Android) instead — relative paths would hit the
// device itself, not Vercel — so native builds need the real origin.
export const API_BASE = Capacitor.isNativePlatform() ? 'https://pond.eend.app' : ''

/**
 * How long any of our own endpoints may take before it counts as not
 * answering.
 *
 * Generous, because the model-backed ones genuinely think — the planner and
 * the story take tens of seconds on a long trip, and cutting those off would
 * invent failures on a feature that was working. But finite, because a
 * request that never settles never rejects, so every `try/catch` around a
 * caller is decoration against it: the promise simply never resolves, the
 * spinner never stops, and nothing anywhere is recorded.
 *
 * That is not hypothetical. It is exactly how the Google Photos import sat
 * on "checking with Google" until the app was killed, in two different
 * functions, on two different nights.
 */
export const NO_ANSWER_AFTER = 45000

/**
 * Calling one of our own endpoints, and noticing when it does not answer.
 *
 * Every caller used to `fetch` directly and handle its own failure, which
 * meant the failure was handled on screen and recorded nowhere. An endpoint
 * that has been 500ing for a week is invisible: the person sees "that
 * didn't work", shrugs, and tries something else.
 *
 * Deliberately thin. It does not retry, does not parse, does not change the
 * response — the caller gets back exactly what `fetch` would have returned,
 * including the throw on a dead network. The only thing it adds is that
 * somebody finds out.
 *
 * Not done by patching `window.fetch`, which would have caught these and
 * everything else for nothing. Eight call sites are not worth reaching
 * under the whole app and hoping nothing depended on the original — least
 * of all this week.
 *
 * @param path  "/api/plan-chat" — leading slash, no origin
 */
export async function callApi(path, options) {
  checkedPath(path)
  const at = performance.now()
  // Aborted rather than merely raced, so a dead request is dropped instead
  // of left holding a connection behind a promise nobody awaits any more.
  // A caller that passes its own signal keeps it — theirs wins, and this
  // only adds a ceiling where there was none.
  const stop = !options?.signal && typeof AbortController === 'function' ? new AbortController() : null
  const timer = stop ? setTimeout(() => stop.abort(), NO_ANSWER_AFTER) : null
  try {
    const res = await fetch(`${API_BASE}${path}`, stop ? { ...options, signal: stop.signal } : options)
    if (!res.ok) {
      // Read the body from a clone, so the caller still gets an unread one.
      const said = await res.clone().text().catch(() => '')
      apiFailed(path, res.status, said)
    } else {
      // How long the model-backed endpoints take is the difference between
      // "thinking" and "broken", and nothing has ever measured it.
      tookMs('api_ok', at, { path })
    }
    return res
  } catch (e) {
    // No network, DNS gone, the request blocked, or the deadline above. A
    // real failure, and the one most likely to be silent because there is no
    // status to inspect.
    //
    // An abort we caused is reported as what it is rather than as the
    // browser's own wording, which says "The user aborted a request" — a
    // sentence that sends whoever reads it looking for a user who did
    // nothing of the kind.
    const ours = stop?.signal.aborted && e?.name === 'AbortError'
    apiFailed(path, 0, ours ? `no answer in ${NO_ANSWER_AFTER / 1000}s` : e?.message)
    throw ours ? new Error(`${path} did not answer — worth trying again`) : e
  } finally {
    clearTimeout(timer)
  }
}
