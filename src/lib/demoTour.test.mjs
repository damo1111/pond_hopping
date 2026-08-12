import { test } from 'node:test'
import assert from 'node:assert/strict'
import {shouldBadge, ownTrips, isDemo} from './demoTour.js'

const demo = { slug: 'south-korea', is_demo: true }
const mine = { slug: 'japan-2027', is_demo: false }

// The tour itself is gone — three tooltip steps, the rule for when to run
// them, and the flag that remembered. Its tests went with it. What is left
// here covers the parts four other files still use: whose trips are whose,
// and whether a trip is the example.
//
// The badge outlives the tour on purpose. As long as somebody else's holiday
// is sitting on a Home among your own it should keep saying so, or the first
// time you scroll past it in six months you will think you went there.


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


