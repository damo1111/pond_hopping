import { test } from 'node:test'
import assert from 'node:assert/strict'
import { legWindow, photosOnLeg } from './photosOnLeg.js'

const leg = {
  dep_time: '2026-05-21T22:00:00Z',
  arr_time: '2026-05-22T09:00:00Z',
}

test('a photograph taken in the air belongs to the flight', () => {
  // Nobody else can show these beside the flight, because nobody else holds
  // both the leg and the photographs.
  const onIt = photosOnLeg(
    [
      { id: 'before', taken_at: '2026-05-21T14:00:00Z' },
      { id: 'wing', taken_at: '2026-05-22T02:30:00Z' },
      { id: 'meal', taken_at: '2026-05-22T00:15:00Z' },
      { id: 'after', taken_at: '2026-05-22T19:00:00Z' },
    ],
    leg
  )
  // In the order they were taken, which is the order they happened.
  assert.deepEqual(onIt.map((p) => p.id), ['meal', 'wing'])
})

test('the window follows the delay, because the photographs did', () => {
  // A flight that pushed back forty minutes late took its pictures forty
  // minutes late too, and the scheduled window would miss the last of them.
  const late = { ...leg, actual_dep_time: '2026-05-21T22:40:00Z', actual_arr_time: '2026-05-22T09:45:00Z' }
  const onIt = photosOnLeg([{ id: 'landing', taken_at: '2026-05-22T09:30:00Z' }], late)
  assert.deepEqual(onIt.map((p) => p.id), ['landing'])
  // And on the scheduled times alone it would have been missed.
  assert.deepEqual(photosOnLeg([{ id: 'landing', taken_at: '2026-05-22T09:30:00Z' }], leg, 0), [])
})

test('a photograph with no clock on it belongs to the trip, not to a leg', () => {
  assert.deepEqual(photosOnLeg([{ id: 'x' }, { id: 'y', taken_at: null }], leg), [])
})

test('and a flight with no times claims nothing at all', () => {
  assert.equal(legWindow({}), null)
  assert.equal(legWindow({ dep_time: '2026-05-21T22:00:00Z' }), null)
  // Arrival before departure is two disagreeing timezones, not a leg.
  assert.equal(legWindow({ dep_time: '2026-05-22T09:00:00Z', arr_time: '2026-05-21T22:00:00Z' }), null)
  assert.deepEqual(photosOnLeg([{ id: 'a', taken_at: '2026-05-22T02:00:00Z' }], {}), [])
})
