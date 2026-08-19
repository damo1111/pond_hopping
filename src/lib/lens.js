// Moving through a set of photographs one at a time.
//
// The planner's Photos tab rendered bare <img> tags with no click handler on
// them at all — a contact sheet you could look at and not open. Reported as
// "I cannot tap into them or scroll through them", which is exactly what it
// was.
//
// The arithmetic lives here rather than in the component because every bug a
// photo viewer has is an off-by-one at an end: the first picture, the last
// one, the one that was removed while you were looking at it, the set that
// emptied underneath you. None of those are comfortable to reproduce by
// tapping.

/**
 * Where to go from here.
 *
 * Stops at the ends rather than wrapping. Wrapping is right for a carousel
 * you are idling through and wrong for a set you are working along: swiping
 * off the last photograph and landing back on the first reads as the app
 * having lost your place, and the next swipe then undoes work you thought
 * you had finished.
 *
 * @returns the new index, or the same one at an end
 */
export function step(at, by, count) {
  if (!Number.isFinite(count) || count <= 0) return 0
  const from = Number.isFinite(at) ? at : 0
  const to = from + by
  if (to < 0) return 0
  if (to > count - 1) return count - 1
  return to
}

/** At an end, so the arrow can say so rather than being tappable and inert. */
export const atStart = (at) => !Number.isFinite(at) || at <= 0
export const atEnd = (at, count) => !Number.isFinite(count) || at >= count - 1

/**
 * Where the viewer should sit after the set changes underneath it.
 *
 * Photographs are removed, and imports land while somebody is looking. The
 * viewer holds an index into a list that is no longer the same list, so this
 * follows the *photograph* rather than the number — by its id — and falls
 * back to the nearest position when the one being looked at has gone.
 *
 * Returns null when there is nothing left to look at, which is the signal to
 * close rather than to show photograph number minus one.
 */
export function keptPlace(was, photos = []) {
  if (!photos.length) return null
  if (was?.id) {
    const found = photos.findIndex((p) => p.id === was.id)
    if (found >= 0) return found
  }
  // Gone. The nearest surviving position, clamped — which for a removal
  // means the one that slid into its place, and that is what somebody
  // deleting a run of photographs expects to be looking at.
  const near = Number.isFinite(was?.at) ? was.at : 0
  return Math.min(Math.max(near, 0), photos.length - 1)
}

/**
 * A swipe, or a scroll that happened to be sideways.
 *
 * The threshold is what stops a vertical scroll through a grid registering
 * as a sideways move: a real horizontal swipe travels much further across
 * than down, and a thumb dragging a list does the opposite.
 */
export const SWIPE_MIN = 40

export function swipedTo(dx, dy, { min = SWIPE_MIN } = {}) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0
  if (Math.abs(dx) < min) return 0
  if (Math.abs(dx) <= Math.abs(dy)) return 0
  return dx < 0 ? 1 : -1
}

/** "12 of 59" — said, because a viewer with no position in it is a picture
 *  with no idea how much more there is. */
export function saidAs(at, count) {
  if (!Number.isFinite(count) || count <= 0) return ''
  return `${Math.min(Math.max(at + 1, 1), count)} of ${count}`
}
