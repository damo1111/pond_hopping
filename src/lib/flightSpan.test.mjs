import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayShift, drift, flightPhase, howItWent, instantAt, saidAs, saysNow, spanMinutes } from './flightSpan.js'

test('a flight is a span, and the span is in the data already', () => {
  assert.equal(spanMinutes('2026-05-21T22:05:00Z', '2026-05-22T09:30:00Z'), 685)
  assert.equal(saidAs(685), '11h 25m')
})

test('an hour on the nose does not read as "3h 00m"', () => {
  assert.equal(saidAs(180), '3h')
  assert.equal(saidAs(45), '45m')
})

test('a missing arrival shows no duration rather than NaN', () => {
  // A flight typed in by hand often has one time and not the other.
  assert.equal(spanMinutes('2026-05-21T22:05:00Z', null), null)
  assert.equal(spanMinutes(null, '2026-05-22T09:30:00Z'), null)
  assert.equal(spanMinutes('nonsense', '2026-05-22T09:30:00Z'), null)
  assert.equal(saidAs(null), '')
})

test('and times that disagree say nothing rather than something confident', () => {
  // Usually a timezone written into one and not the other. "-3h 00m" stated
  // plainly is worse than a blank.
  assert.equal(spanMinutes('2026-05-22T09:30:00Z', '2026-05-21T22:05:00Z'), null)
})

test('a red-eye says +1, or it reads as landing before it left', () => {
  assert.equal(dayShift('2026-05-21', '2026-05-22'), 1)
  assert.equal(dayShift('2026-05-21', '2026-05-23'), 2)
  assert.equal(dayShift('2026-05-21', '2026-05-21'), 0)
  // Westbound across the line can land the day before, and that is real.
  assert.equal(dayShift('2026-05-21', '2026-05-20'), -1)
  assert.equal(dayShift(null, '2026-05-22'), 0)
})

test('landed early is the line people open a flight tracker for', () => {
  // actual_arr_time has been stored for months and shown nowhere.
  const said = howItWent({
    arr_time: '2026-05-22T09:30:00Z',
    actual_arr_time: '2026-05-22T09:18:00Z',
  })
  assert.deepEqual(said, { minutes: 12, word: 'early', late: false, when: 'Landed' })
})

test('and arrival beats departure, because once it has landed nobody cares', () => {
  const said = howItWent({
    dep_time: '2026-05-21T22:05:00Z',
    actual_dep_time: '2026-05-21T22:48:00Z',
    arr_time: '2026-05-22T09:30:00Z',
    actual_arr_time: '2026-05-22T09:35:00Z',
  })
  // Five minutes is within the slack, so it landed on time despite leaving
  // forty-three minutes late.
  assert.equal(said.when, 'Landed')
  assert.equal(said.word, 'on time')
})

test('three minutes is not a story', () => {
  // Airlines pad schedules. A card announcing "2 minutes late" every leg
  // trains somebody to stop reading the line that matters when it is twenty.
  assert.equal(drift('2026-05-22T09:30:00Z', '2026-05-22T09:33:00Z').word, 'on time')
  assert.equal(drift('2026-05-22T09:30:00Z', '2026-05-22T09:52:00Z').word, 'late')
})

test('an unflown flight says nothing at all', () => {
  assert.equal(howItWent({ arr_time: '2026-05-22T09:30:00Z' }), null)
  assert.equal(howItWent({}), null)
  assert.equal(drift(null, null), null)
})

const AT = (iso) => Date.parse(iso)
const trip = { dep_time: '2026-05-21T22:00:00Z', arr_time: '2026-05-22T09:00:00Z' }

test('the card had one tense, and it was the past', () => {
  // "Landed twelve minutes early" is the least useful thing it can say to
  // somebody at a gate with the flight in three hours.
  assert.equal(flightPhase(trip, AT('2026-05-19T10:00:00Z')).phase, 'later')
  assert.equal(flightPhase(trip, AT('2026-05-21T14:00:00Z')).phase, 'soon')
  assert.equal(flightPhase(trip, AT('2026-05-21T21:30:00Z')).phase, 'boarding')
  assert.equal(flightPhase(trip, AT('2026-05-22T03:00:00Z')).phase, 'airborne')
  assert.equal(flightPhase(trip, AT('2026-05-22T11:00:00Z')).phase, 'landed')
  assert.equal(flightPhase(trip, AT('2026-05-25T11:00:00Z')).phase, 'past')
})

test('in the air, it says how much is left and how far along', () => {
  const at = flightPhase(trip, AT('2026-05-22T03:30:00Z'))
  assert.equal(at.left, 330)
  // Five and a half hours into eleven.
  assert.ok(Math.abs(at.part - 0.5) < 0.01)
  assert.equal(saysNow(trip, AT('2026-05-22T03:30:00Z')), '5h 30m to go')
})

test('and never draws the plane past its destination', () => {
  // A schedule that slipped should not put it beyond the far end of the line.
  const late = { dep_time: '2026-05-21T22:00:00Z', arr_time: '2026-05-22T09:00:00Z', actual_dep_time: '2026-05-21T22:00:00Z' }
  const at = flightPhase(late, AT('2026-05-22T08:59:00Z'))
  assert.ok(at.part <= 1)
})

test('the phase follows what happened, not what was printed', () => {
  // Pushed back an hour late: at 22:30 it is still boarding, not airborne.
  const late = { ...trip, actual_dep_time: '2026-05-21T23:00:00Z' }
  assert.equal(flightPhase(late, AT('2026-05-21T22:30:00Z')).phase, 'boarding')
})

test('a flight with no times says nothing rather than guessing', () => {
  assert.equal(flightPhase({}).phase, 'later')
  assert.equal(saysNow({}), null)
})

test('a planned long-haul is as long as it actually is', () => {
  // The card stores what the booking says: two wall-clock readings, on two
  // clocks six hours apart. Subtracting them said the flight to London takes
  // half the time it does — confidently, on the one card whose whole job is
  // to say how long you are in the air.
  const dep = instantAt('2026-08-18T00:20:00', 'BKK')
  const arr = instantAt('2026-08-18T07:00:00', 'LHR')
  assert.equal(spanMinutes(dep, arr), 760) // 12h 40m

  // Prove the check can fail: this is what the card did before, from the
  // very same two strings.
  assert.equal(spanMinutes('2026-08-18T00:20:00', '2026-08-18T07:00:00'), 400)
})

test('and a domestic hop is unaffected, because both clocks agree', () => {
  const dep = instantAt('2026-08-19T10:20:00', 'BKK')
  const arr = instantAt('2026-08-19T11:45:00', 'KBV')
  assert.equal(spanMinutes(dep, arr), 85)
})

test('an airport with no zone says nothing rather than something wrong', () => {
  // A guessed offset is the same class of error this exists to remove, so
  // there is no fallback. The caller shows no duration, which is honest.
  assert.equal(instantAt('2026-08-18T07:00:00', 'ZZZ'), null)
  assert.equal(instantAt('2026-08-18T07:00:00', null), null)
  assert.equal(instantAt(null, 'LHR'), null)
  assert.equal(spanMinutes(instantAt('2026-08-18T07:00:00', 'ZZZ'), 'x'), null)
})
