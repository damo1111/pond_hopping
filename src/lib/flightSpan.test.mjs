import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayShift, saidAs, spanMinutes } from './flightSpan.js'

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
