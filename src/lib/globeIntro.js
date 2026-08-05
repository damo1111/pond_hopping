// The cold open.
//
// Every travel app opens on a logo. This one opens on the globe it already
// renders, far away and empty, and then draws your actual flights onto it in
// the order you flew them until the sphere is laced with everywhere you have
// been — and settles into the Home view. It is the one intro no other travel
// app can copy, because the asset is your own history.
//
// No new dependency: three.js is already in the bundle for the globe, and the
// arcs are the same arcs Home draws. All this adds is a clock.

export const INTRO = {
  // A beat of stillness first. Motion that begins on frame one reads as a
  // page loading; motion that begins after a held breath reads as deliberate.
  holdMs: 320,
  // Long enough that the first few arcs land one at a time and you register
  // them as individual journeys, short enough that nobody waits.
  drawMs: 2600,
  // The earth comes toward you while its history fills in — the two overlap,
  // which is what stops this feeling like two separate animations.
  flyMs: 3100,
  // How far out it starts. Small enough to read as distant, not so small the
  // arcs are invisible when they begin.
  startAltitude: 3.4,
}

export const introDuration = ({ holdMs, drawMs } = INTRO) => holdMs + drawMs

// Ease-in: the first arcs arrive slowly and separately, then the long tail
// floods. Linear would either bore you at the start or blur the beginning.
const easeIn = (t) => t * t * t

/**
 * How many arcs should be on the globe this many ms in.
 * Always ends on all of them, and never shows a fraction of one.
 */
export function arcsShown(elapsed, total, { holdMs, drawMs } = INTRO) {
  if (!(total > 0)) return 0
  if (elapsed <= holdMs) return 0
  const t = Math.min(1, (elapsed - holdMs) / drawMs)
  if (t >= 1) return total
  // At least one as soon as drawing starts, so the globe is never briefly
  // "moving but empty" — that reads as broken rather than as anticipation.
  return Math.max(1, Math.min(total, Math.round(easeIn(t) * total)))
}

/**
 * Oldest first. The order is the whole point: it's your history assembling
 * itself in the order it happened, not a random flood.
 *
 * A route with no dated flights on it sorts last rather than to 1970, which
 * would put the unknown ones first and make the sequence start with a lie.
 */
export function chronological(arcs = []) {
  const firstFlown = (a) => {
    const times = (a.flights || [])
      .map((f) => Date.parse(f.dep_time))
      .filter((n) => Number.isFinite(n))
    return times.length ? Math.min(...times) : Infinity
  }
  return arcs
    .map((a, i) => ({ a, i, t: firstFlown(a) }))
    // Index as the tiebreak so the order is stable across renders — without
    // it, equal timestamps could shuffle and arcs would flicker as they draw.
    .sort((x, y) => x.t - y.t || x.i - y.i)
    .map((x) => x.a)
}
