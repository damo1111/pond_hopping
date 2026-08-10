// Is the app in the middle of something it would be rude to interrupt?
//
// A new deploy's service worker can take control at any moment, and the app
// reloads to pick it up — carefully, only once the phone has been away long
// enough to be sure somebody really left rather than a permission dialog
// having flashed past. That logic asks whether anybody is *looking*. It
// never asked whether the app was *doing anything*.
//
// So: two photographs part-way through uploading, switch apps for a moment,
// come back to a freshly booted app and no photographs. Nothing failed
// loudly. The upload simply stopped existing, along with the screen that
// would have said so.
//
// This is the missing half of that question. Work that would be lost by a
// reload says so while it runs, and the reload waits. It is deliberately
// tiny and has no idea what the work is — a counter and a promise to tell
// you when it hits zero.

let depth = 0
const waiting = new Set()

/**
 * Mark the start of something interruptible. Returns the function that ends
 * it — idempotent, so a `finally` that runs twice cannot drive the count
 * negative and leave the app permanently "busy", which would be a worse bug
 * than the one this fixes.
 */
export function begin() {
  depth += 1
  let ended = false
  return function end() {
    if (ended) return
    ended = true
    depth -= 1
    if (depth > 0) return
    depth = 0
    // Copied before calling: a listener that starts new work would
    // otherwise mutate the set being iterated.
    const now = [...waiting]
    waiting.clear()
    for (const fn of now) fn()
  }
}

/** Whether anything is in flight. */
export function busy() {
  return depth > 0
}

/**
 * Call back once nothing is in flight — immediately if that is already
 * true, so a caller never has to check first and then subscribe, which is
 * the shape that drops the event landing between the two.
 *
 * @returns unsubscribe
 */
export function whenIdle(fn) {
  if (depth === 0) {
    fn()
    return () => {}
  }
  waiting.add(fn)
  return () => waiting.delete(fn)
}

/** Tests only. */
export function reset() {
  depth = 0
  waiting.clear()
}
