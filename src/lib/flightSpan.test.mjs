import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayShift, drift, howItWent, saidAs, spanMinutes } from './flightSpan.js'

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
