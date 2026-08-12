// The ways into the app, and which one to put first.
//
// A code by email is the slowest possible sign-in and the only one that
// needs a working inbox at the exact moment somebody is trying to get in —
// on a trip, on hotel wifi, in a country whose mail server greylists you for
// four minutes. Which is precisely when this app is used.
//
// So: Apple and Google as the fast paths, and the code kept, because it is
// the one that works for somebody with neither account, and because it is
// what every existing hopper already has.
//
// Nothing here decides whether a provider is *available* — that is a
// Supabase setting and an Apple/Google console away, and a button for a
// provider the project has not been told about answers "Unsupported provider"
// in a language nobody should be shown. So availability comes from
// configuration, and until it is set the sheet looks exactly as it does now.

/** Remembered so a returning hopper is not made to think. */
const LAST = 'pond:way_in'

export const WAYS = {
  apple: { id: 'apple', label: 'Continue with Apple' },
  google: { id: 'google', label: 'Continue with Google' },
}

/**
 * Which providers this build may offer.
 *
 * Comma-separated, from VITE_WAYS_IN. Empty — the default — means the sheet
 * is the email-and-code sheet it has always been, which is the right way to
 * fail: a missing setting must not put a dead button in front of somebody.
 *
 * @param configured e.g. "apple, google"
 */
export function waysIn(configured = '') {
  return String(configured ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((id) => WAYS[id])
    // Deduplicated, and in our order rather than the order somebody happened
    // to type into an environment variable.
    .filter((id, i, all) => all.indexOf(id) === i)
    .sort((a, b) => Object.keys(WAYS).indexOf(a) - Object.keys(WAYS).indexOf(b))
    .map((id) => WAYS[id])
}

/** What they used last time, if it is still on offer. */
export function lastWayIn(store = globalThis.localStorage, offered = []) {
  try {
    const id = store?.getItem(LAST)
    return offered.some((w) => w.id === id) ? id : null
  } catch {
    return null
  }
}

export function rememberWayIn(id, store = globalThis.localStorage) {
  try {
    if (WAYS[id] || id === 'code') store?.setItem(LAST, id)
  } catch {
    /* storage off; they get the default order, which is fine */
  }
}

/**
 * The offer, in the order to draw it.
 *
 * Whatever they used last comes first — not because it is better, but
 * because "which of these did I use?" is the single most common reason
 * somebody ends up with two accounts, and the answer is right there.
 */
export function offerIn(configured, store = globalThis.localStorage) {
  const offered = waysIn(configured)
  const last = lastWayIn(store, offered)
  if (!last) return { ways: offered, last: null }
  return {
    ways: [...offered].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : 0)),
    last,
  }
}
