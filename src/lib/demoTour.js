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

export const ownTrips = (trips) => (trips ?? []).filter((t) => !isDemo(t))

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
    anchor: '.wt-card',
    title: 'This trip isn’t yours',
    body: 'It’s a real log left here as an example, so the app has something to show before you’ve added anything. Tap it to see what a finished trip looks like.',
  },
  {
    id: 'globe',
    anchor: '.globe-shift',
    title: 'Every flight, drawn',
    body: 'The globe carries every route you’ve flown. Right now it’s showing the example’s four.',
  },
  {
    id: 'plan',
    anchor: '.navitem-plan',
    title: 'Start with where you’re going',
    body: 'Plan is where a trip begins — dates, flights, somewhere to stay. Add one and this example steps aside.',
  },
]

/** Steps whose anchor actually exists right now. */
export const visibleSteps = (doc = document) =>
  STEPS.filter((s) => doc.querySelector(s.anchor))
