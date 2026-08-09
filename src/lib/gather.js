// Several answers, several independent fates.
//
// The trip recap fetched six things in one Promise.all, with no catch and
// no timeout. One request that stalled or was refused and `data` stayed
// null forever — and the screen that opens the recap does not wait for it,
// so what you got was a finished-looking page carrying one figure out of
// six. On that page the figures *are* the navigation, so losing five of
// them lost every way through to the flights, the map, the journal, the
// runs and the photographs. A single slow request took the trip away.
//
// The shape that cannot do that: each answer stands or falls alone, a
// request that never returns is one missing figure rather than a missing
// page, and there is a grace period so that on a connection quick enough
// the whole thing still arrives at once instead of assembling itself in
// front of you.
//
// Nothing here knows about Supabase or React — it takes promises and hands
// back pieces — which is why it can be tested rather than reasoned about.

import { settled } from './settled.js'

export const GRACE_MS = 600
export const TIMEOUT_MS = 15000

/**
 * @param jobs      [{ query, take }] — take() turns one answer into the
 *                  piece of state it contributes. Skipped entirely if the
 *                  query fails, so a failure contributes nothing rather
 *                  than contributing a wrong nothing.
 * @param onSlice   called with the merged pieces, once per flush
 * @param onReady   called once, when there is something worth showing
 * @param onTrouble called per failure with a reason, for the log
 * @returns cancel  after which nothing is called again
 */
export function gather(jobs = [], { grace = GRACE_MS, timeout = TIMEOUT_MS, onSlice, onReady, onTrouble } = {}) {
  let alive = true
  // Answers in hand but not yet shown. Held only until the grace period is
  // up; after that the gate stays open and each one lands as it arrives.
  let waiting = null
  let open = false
  let outstanding = jobs.length
  let told = false

  const flush = () => {
    if (!alive || !waiting) return
    const arrived = waiting
    waiting = null
    onSlice?.(arrived)
  }

  const ready = () => {
    if (!alive || told) return
    told = true
    onReady?.()
  }

  for (const { query, take } of jobs) {
    settled(query, timeout).then((res) => {
      if (!alive) return
      outstanding -= 1
      // undefined means it timed out or threw; res.error means the server
      // refused. Either way the others are untouched.
      if (!res) onTrouble?.('no answer in time')
      else if (res.error) onTrouble?.(res.error.message || 'refused')
      else waiting = { ...waiting, ...take(res) }
      if (open || outstanding === 0) {
        flush()
        ready()
      }
    })
  }

  // Also what rescues the case where every single request fails: the page
  // is told to open regardless, and shows honestly little rather than
  // hanging on a spinner nobody put a limit on.
  const timer = setTimeout(() => {
    open = true
    flush()
    ready()
  }, grace)

  return () => {
    alive = false
    clearTimeout(timer)
  }
}
