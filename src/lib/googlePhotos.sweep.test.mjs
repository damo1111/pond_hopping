import { test } from 'node:test'
import assert from 'node:assert/strict'
import { whatToDoWith } from './googlePhotos.js'

test('a session Google says is set gets collected', () => {
  assert.equal(whatToDoWith({ mediaItemsSet: true }), 'collect')
})

test('a session nobody has finished picking in is left alone', () => {
  assert.equal(whatToDoWith({ mediaItemsSet: false }), 'wait')
  assert.equal(whatToDoWith({}), 'wait')
})

test('a session Google has forgotten is given up on, not retried forever', () => {
  // The difference between this and the case below is the whole point. A
  // forgotten session will never become ready, so retrying it once a minute
  // fills the queue with rows nobody will ever look at.
  assert.equal(whatToDoWith(null, 404), 'gone')
  assert.equal(whatToDoWith(null, 403), 'gone')
  assert.equal(whatToDoWith(null, 401), 'gone')
})

test('but Google having a bad minute is not a reason to throw a pick away', () => {
  // Somebody chose seventy photographs. A 500 must cost them a minute, not
  // the pick — which is exactly the loss this route exists to prevent.
  assert.equal(whatToDoWith(null, 500), 'wait')
  assert.equal(whatToDoWith(null, 502), 'wait')
  assert.equal(whatToDoWith(undefined, 0), 'wait')
  assert.equal(whatToDoWith('not json', 200), 'wait')
})
