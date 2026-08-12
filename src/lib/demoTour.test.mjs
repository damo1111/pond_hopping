import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldTour, shouldBadge, ownTrips, isDemo, STEPS, visibleSteps } from './demoTour.js'

const demo = { slug: 'south-korea', is_demo: true }
const mine = { slug: 'japan-2027', is_demo: false }

test('the tour waits for the trips to actually arrive', () => {
  assert.equal(shouldTour({ trips: [demo], tripsLoaded: false, dismissed: false }), false)
  assert.equal(shouldTour({ trips: [demo], tripsLoaded: true, dismissed: false }), true)
})

test('the tour runs for someone who only has the demo', () => {
  assert.equal(shouldTour({ trips: [demo], tripsLoaded: true, dismissed: false }), true)
})

test('the tour stops the moment there is one real trip', () => {
  assert.equal(shouldTour({ trips: [demo, mine], tripsLoaded: true, dismissed: false }), false)
})

test('a dismissed tour stays dismissed', () => {
  assert.equal(shouldTour({ trips: [demo], tripsLoaded: true, dismissed: true }), false)
})

test('no demo trip, no tour — there would be nothing to point at', () => {
  assert.equal(shouldTour({ trips: [mine], tripsLoaded: true, dismissed: false }), false)
  assert.equal(shouldTour({ trips: [], tripsLoaded: true, dismissed: false }), false)
})

test('missing and undefined trip lists do not throw', () => {
  assert.equal(shouldTour({ trips: undefined, tripsLoaded: true, dismissed: false }), false)
  assert.deepEqual(ownTrips(undefined), [])
})

test('the badge outlives the tour — a demo among your own still says so', () => {
  // The tour is off here (a real trip exists) but the label must remain.
  assert.equal(shouldTour({ trips: [demo, mine], tripsLoaded: true, dismissed: false }), false)
  assert.equal(shouldBadge(demo), true)
  assert.equal(shouldBadge(mine), false)
})

test('isDemo reads either the database column or a camelCase mapping', () => {
  assert.equal(isDemo({ is_demo: true }), true)
  assert.equal(isDemo({ isDemo: true }), true)
  assert.equal(isDemo({}), false)
  assert.equal(isDemo(null), false)
})

test('ownTrips is the negative of the demo flag, not a count of content', () => {
  // An empty trip someone just created is still theirs.
  const empty = { slug: 'someday', is_demo: false, flight_count: 0, photo_count: 0 }
  assert.deepEqual(ownTrips([demo, empty]), [empty])
})

test('steps with no anchor on screen are skipped rather than pointing at nothing', () => {
  // Read the selector off the step rather than writing it out here. The
  // hard-coded '.wt-card' in the first version of this test went on passing
  // after the welcome step was re-anchored to '.wt-card--demo', which is the
  // same class of mistake the re-anchoring fixed: a string that has to match
  // something elsewhere and nothing checks that it still does.
  const welcome = STEPS.find((s) => s.id === 'welcome')
  const doc = { querySelector: (sel) => (sel === welcome.anchor ? {} : null) }
  const shown = visibleSteps(doc)
  assert.equal(shown.length, 1)
  assert.equal(shown[0].id, 'welcome')
})

test('every step has an anchor, a title and a body', () => {
  for (const s of STEPS) {
    assert.ok(s.id && s.anchor && s.title && s.body, `step ${s.id} is incomplete`)
  }
})
