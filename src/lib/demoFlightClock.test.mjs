import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onTodaysClock } from './demoFlightClock.js'
import { flightPhase } from './flightSpan.js'

const now = Date.parse('2026-08-15T12:00:00Z')
const legs = [
  { id: 'a', dep_time: '2026-05-21T22:00:00Z', arr_time: '2026-05-22T09:00:00Z', actual_arr_time: '2026-05-22T08:50:00Z' },
  { id: 'b', dep_time: '2026-05-23T10:00:00Z', arr_time: '2026-05-23T14:00:00Z' },
  { id: 'c', dep_time: '2026-05-30T10:00:00Z', arr_time: '2026-05-30T14:00:00Z' },
]

test('the first example leg is in the air, so the state can be seen at all', () => {
  const [a] = onTodaysClock(legs, now)
  const at = flightPhase(a, now)
  assert.equal(at.phase, 'airborne')
  // Visibly partial rather than ambiguous.
  assert.ok(at.part > 0.3 && at.part < 0.5)
})

test('the second is boarding', () => {
  const [, b] = onTodaysClock(legs, now)
  assert.equal(flightPhase(b, now).phase, 'boarding')
})

test('and the rest keep their own times untouched', () => {
  const [, , c] = onTodaysClock(legs, now)
  assert.deepEqual(c, legs[2])
})

test('a flight in the air is not told how it went', () => {
  // Moving the actuals along with the schedule would make the card report an
  // arrival that has not happened.
  const [a] = onTodaysClock(legs, now)
  assert.equal(a.actual_arr_time, null)
  assert.equal(a.actual_dep_time, null)
})

test('and a leg with no times is left exactly as it is', () => {
  assert.deepEqual(onTodaysClock([{ id: 'x' }], now), [{ id: 'x' }])
})
