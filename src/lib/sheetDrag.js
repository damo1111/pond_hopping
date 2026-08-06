// The pull-to-close decision, as data rather than as event handlers.
//
// This lives here because the browser version of it was wrong three times in
// a row and every DOM test I wrote passed anyway. Desktop Chromium and
// Android's WebView disagree about which events a downward drag produces —
// in particular whether the engine claims the gesture and fires a cancel
// part-way through — and a test harness can only dispatch inputs a real
// finger could produce, which is exactly the case that was broken.
//
// Pure functions over a plain object have no such problem: every ending, in
// every order, is expressible.
//
// The state object:
//   { y, t, dy, at, claimed }
//   y       where the finger went down
//   t       when it went down
//   dy      the furthest *downward* distance observed
//   at      when dy was last observed (for velocity)
//   claimed whether we took the gesture off the browser

/** Far enough down to be deliberate rather than a stray thumb. */
export const CLOSE_AT = 96

/** Enough movement to tell a pull from a tap. */
const SLOP = 6

/** A flick this fast closes without needing the full distance. px per ms. */
const FLICK = 0.6

/**
 * ...but only after this far. Velocity over a single 16ms frame is noisy —
 * a 30px twitch reads as nearly 2 px/ms, which is fast enough to close a
 * sheet nobody meant to close. Distance is the sanity check on speed.
 */
const FLICK_MIN = 40

/**
 * Start tracking, unless the touch began inside a list that is already
 * scrolled — pulling the sheet must never compete with reading it.
 *
 * Returns the new state, or null to ignore this gesture.
 */
export function beginDrag({ y, t, inBody, scrollTop }) {
  if (inBody && (scrollTop || 0) > 0) return null
  return { y, t, dy: 0, at: t, claimed: false }
}

/**
 * A move. Returns { state, drag, mine } — mine being the caller's cue to take
 * the event away from the browser.
 *
 * An upward move releases the gesture: that is the list scrolling, and
 * letting go of it is what keeps reading unaffected.
 */
export function extendDrag(state, { y, t }) {
  if (!state) return { state: null, drag: null, mine: false }
  const dy = y - state.y

  // A finger is not a straight line. Pressing down and then dragging almost
  // always produces a first move of a pixel or two *upward* as the thumb
  // settles and rolls, and this used to read that as "not my gesture" and
  // throw the whole thing away — permanently, before the pull had even
  // started. Nothing afterwards could recover it, which is what "the handle
  // does nothing" was. Synthetic drags are perfectly monotonic, so no test
  // ever produced it.
  //
  // Below the slop, in either direction, the gesture is simply undecided.
  if (Math.abs(dy) < SLOP && !state.claimed) return { state, drag: null, mine: false }

  // A deliberate *upward* move before we have claimed anything is the list
  // scrolling. Let it go — that is what keeps reading unaffected.
  if (dy <= -SLOP && !state.claimed) return { state: null, drag: null, mine: false }

  // Dragged back up past the start after claiming: hold at rest, but keep the
  // gesture, so pulling down again still works without lifting off.
  if (dy <= 0) return { state, drag: 0, mine: true }

  const next = { ...state, claimed: true, dy: Math.max(state.dy, dy), at: t }
  return { state: next, drag: resistance(dy), mine: true }
}

/** Follows the finger 1:1, then stiffens, so it feels attached to something. */
export function resistance(dy) {
  return dy < CLOSE_AT ? dy : CLOSE_AT + (dy - CLOSE_AT) * 0.4
}

/**
 * The ending — touchend, touchcancel, pointerup or pointercancel alike.
 *
 * endY is the finishing event's own coordinate when it carries one. It is the
 * belt to the braces: an engine that swallowed every move still delivers a
 * final position, and a finger that travelled 150px is not ambiguous just
 * because we never got to draw it moving.
 *
 * A cancel is judged exactly like any other ending. Treating it as "not a
 * decision" and springing back is precisely the bug that kept the handle
 * broken on a real phone — Android's WebView cancels mid-pull.
 *
 * Returns 'close' | 'spring' | 'ignore'.
 */
export function finishDrag(state, endY) {
  if (!state) return 'ignore'
  const travelled = Math.max(state.dy, typeof endY === 'number' ? endY - state.y : 0)
  // Never claimed and never went far: a tap, or a gesture that was somebody
  // else's all along.
  if (!state.claimed && travelled <= CLOSE_AT) return 'ignore'
  // Velocity only means anything if moves were actually observed.
  const velocity = state.claimed ? state.dy / Math.max(1, state.at - state.t) : 0
  if (travelled > CLOSE_AT) return 'close'
  if (travelled >= FLICK_MIN && velocity > FLICK) return 'close'
  return 'spring'
}
