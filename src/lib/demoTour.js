// When to show a new arrival the guided tour, and when to stop.
//
// The rule that matters is the second one. A tour that keeps running after
// you have your own trips in the app is no longer a tour, it is an
// advertisement for a stranger's holiday sitting on top of your own — so the
// moment there is one real trip, the demo stops being introduced and starts
// being just another trip you can delete.
//
// "Real" is the negative of is_demo rather than a count of anything else,
// because a half-built trip with no flights yet is still yours and still
// means the app is no longer empty.

export const TOUR_SEEN_KEY = 'pond:tourdone'

export const isDemo = (trip) => !!(trip?.is_demo ?? trip?.isDemo)

// Trips that are actually yours.
//
// This used to mean "not flagged as the example", which is the same thing
// only while every non-demo trip belongs to whoever is looking. The moment a
// real trip is made public — Rome, for the work group — every visitor on
// earth counts as having a trip of their own: the example steps aside for
// them, and somebody on their first launch meets a globe holding one
// stranger's holiday with nothing to explain it.
//
// `mine` comes from the trip_meta view and answers for whoever is asking.
// Where it is absent — older callers, and tests written before it existed —
// fall back to the flag, which is right for every row that has no other
// owner.
export const ownTrips = (trips) =>
  (trips ?? []).filter((t) => !isDemo(t) && (t?.mine === undefined || t.mine))

/**
 * Whether the walkthrough should run.
 *
 * dismissed is passed in rather than read here so the caller owns storage —
 * it makes this testable without a DOM, and localStorage throws in enough
 * embedded browsers that reading it deep inside a predicate is a bad place
 * to discover that.
 */
export function shouldTour({ trips, tripsLoaded, dismissed }) {
  if (!tripsLoaded) return false
  if (dismissed) return false
  // Nothing to point at.
  if (!(trips ?? []).some(isDemo)) return false
  // They have their own. The demo is no longer the story.
  if (ownTrips(trips).length > 0) return false
  return true
}

/**
 * Whether to badge a trip as an example.
 *
 * Note this outlives the tour deliberately: the tour is a one-off you can
 * dismiss, but as long as a demo trip is sitting on someone's Home among
 * their own, it should keep saying what it is. Otherwise the first time
 * someone scrolls past "HK & South Korea" in six months they will think they
 * went there.
 */
export const shouldBadge = (trip) => isDemo(trip)

/**
 * The steps, in order. Kept as data so the tour component is a renderer and
 * the content is reviewable in one place.
 *
 * `anchor` is a CSS selector resolved at display time; a step whose anchor
 * isn't on screen is skipped rather than pointing at nothing, which is what
 * happens on a narrow phone where the globe controls collapse.
 */
export const STEPS = [
  {
    id: 'welcome',
    // NOT '.wt-card'. That is the class on every card in the rail, and
    // querySelector returns the first one in the document — which is the
    // "Add a trip" tile, because it comes first. So the tour spent its whole
    // life drawing a ring around "Add a trip" while reading out "a real trip,
    // parked here so the place isn't empty". The one selector in the file
    // that had to be specific was the one that was not.
    anchor: '.wt-card--demo',
    title: 'Someone else’s pond',
    body: 'A real trip, parked here so the place isn’t empty when you turn up. Have a paddle round — it’s properly finished, photos and all. Then it clears off.',
  },
  {
    id: 'globe',
    anchor: '.globe-shift',
    title: 'Every hop, drawn',
    body: 'One line per flight you’ve taken. Four so far, and all of them borrowed. Yours will look better.',
  },
  {
    id: 'plan',
    anchor: '.navitem-plan',
    title: 'Where to next?',
    body: 'Plan is where a trip starts — a date, a rough idea, a flight if you’ve booked one. Add one and the borrowed trip paddles off.',
  },
]

/** Steps whose anchor actually exists right now. */
export const visibleSteps = (doc = document) =>
  STEPS.filter((s) => doc.querySelector(s.anchor))
