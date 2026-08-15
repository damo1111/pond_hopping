// Where the opening's card is supposed to land, and what it costs to miss.
//
// The cold open ends by flying its card to the same trip's card on the World
// tab, so the last thing the opening built is the first thing under a thumb.
// It works when it finds something to land on and does nothing at all when
// it does not — and "does nothing at all" was written as a bare early return
// with no note of any kind:
//
//     const target = document.querySelector('.wt-card--demo') ?? …
//     if (!card || !target) return
//
// So a failed handoff and a handoff that was never attempted look identical
// from the outside, and both look identical to the plain fade the screen
// falls back to. It has been reported twice as "the animation is fine but it
// doesn't bounce into the app", and neither report could be told apart from
// the other because nothing anywhere records which happened.
//
// Two things wrong with the original, and only one of them is the message.
//
// The other is timing. It measured once, in the frame `leaving` flipped —
// but the World tab is lazily loaded behind Suspense, and its cards come
// from a query. On a cold start the target may be a hundred milliseconds
// away, and asking once means asking too early and never asking again.
//
// Pure and injectable, so which element gets chosen can be tested without a
// browser, a globe, or a six-second wait.

/** In preference order. The demo trip's own card is the one the opening was
 *  counting up; any trip card is still a better landing than mid-air. */
export const LANDING_SPOTS = ['.wt-card--demo', '.wt-card']

/** The first of those that exists, or null. */
export function findLanding(root, spots = LANDING_SPOTS) {
  if (!root?.querySelector) return null
  for (const spot of spots) {
    const found = root.querySelector(spot)
    if (found) return found
  }
  return null
}

/**
 * The transform that puts one box on top of another.
 *
 * Centres rather than corners, because the two are different shapes: the
 * opening's card is tall and the World tab's is wide, and matching corners
 * would visibly slide the thing sideways on arrival.
 *
 * Returns null when either box has no width. A card that has not been laid
 * out yet measures zero, and dividing by it gives a scale of Infinity —
 * which is not a wrong animation, it is a blank screen, silently.
 */
export function carryTo(from, to) {
  if (!from?.width || !to?.width) return null
  return {
    x: to.left + to.width / 2 - (from.left + from.width / 2),
    y: to.top + to.height / 2 - (from.top + from.height / 2),
    scale: to.width / from.width,
  }
}

/** Long enough to cover a lazy tab arriving late, short enough that the
 *  opening never visibly waits for it. */
export const KEEP_LOOKING_FOR = 700

/**
 * Look for somewhere to land, for a little while.
 *
 * @returns {Promise<Element|null>} the target, or null once the window has
 *          passed. Never rejects: this is the last four hundred milliseconds
 *          of an animation, and there is nothing useful to throw at.
 */
export function waitForLanding(root, { within = KEEP_LOOKING_FOR, now = () => Date.now(), schedule } = {}) {
  const soon = schedule ?? ((fn) => setTimeout(fn, 16))
  const began = now()
  return new Promise((resolve) => {
    const look = () => {
      const found = findLanding(root)
      if (found) return resolve(found)
      if (now() - began >= within) return resolve(null)
      soon(look)
    }
    look()
  })
}

/** How long the card's flight takes. Matches the CSS; see .boot--carrying
 *  .boot-card in globals.css. */
export const FLIGHT_MS = 620

/** Started slightly before the flight ends, so the two overlap and the
 *  destination reads as receiving the card rather than reacting to it
 *  afterwards. */
export const RECEIVE_AT = 540

/**
 * The card being landed on answers.
 *
 * Half the continuity is the flight; the other half is the thing it arrives
 * at acknowledging it. Without this the opening's card flies across and then
 * simply stops on top of a card that never moved, which reads as two layers
 * rather than one object.
 *
 * Deliberately the Web Animations API rather than adding WorldTab's own
 * `.bounce` class. That class is part of a className React composes and
 * rewrites wholesale on its next render, so a class added from outside is
 * removed at a moment nobody controls — mid-animation, invisibly, on some
 * renders and not others. `animate()` touches nothing React owns.
 *
 * Never throws: this is decoration at the end of an animation, and an older
 * engine without animate() should get the flight without the flourish rather
 * than an exception during boot.
 */
export function receiveThe(target) {
  try {
    if (typeof target?.animate !== 'function') return false
    target.animate(
      [
        { transform: 'scale(1)' },
        // Small. The card has just had something land on it, it has not been
        // pressed — and the same 1.06 the tap bounce uses would read as a
        // tap nobody made.
        { transform: 'scale(1.035)', offset: 0.45 },
        { transform: 'scale(1)' },
      ],
      { duration: 340, easing: 'ease' },
    )
    return true
  } catch {
    return false
  }
}
