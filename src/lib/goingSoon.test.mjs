import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SOON_DAYS, today, tripStartingSoon, whenPhrase } from './goingSoon.js'

// Midday, so nothing here depends on which side of midnight the test runs.
const now = new Date('2026-08-09T12:00:00')
const day = (n) => {
  const d = new Date(now)
  d.setDate(d.getDate() + n)
  return today(d)
}

const trip = (title, start, end, extra = {}) => ({
  id: title,
  title,
  start_date: start,
  end_date: end,
  ...extra,
})

test('a trip that has started is the one worth asking about', () => {
  const found = tripStartingSoon([trip('Sri Lanka', day(-2), day(9))], now)
  assert.equal(found.trip.title, 'Sri Lanka')
  assert.equal(found.underway, true)
})

test('a trip about to start counts, and one too far off does not', () => {
  assert.equal(tripStartingSoon([trip('Porto', day(4), day(11))], now).inDays, 4)
  assert.equal(tripStartingSoon([trip('Porto', day(SOON_DAYS), day(30))], now).inDays, SOON_DAYS)
  assert.equal(tripStartingSoon([trip('Porto', day(SOON_DAYS + 1), day(30))], now), null)
})

test('a trip that finished is over, and nobody wants asking about it', () => {
  assert.equal(tripStartingSoon([trip('Rome', day(-20), day(-9))], now), null)
})

test('an open-ended trip that has started is still going', () => {
  // Guessing an end date would either stop recording mid-holiday or never
  // stop at all, so an absent one means "still on it".
  const found = tripStartingSoon([trip('The Voyage', day(-3), null)], now)
  assert.equal(found.underway, true)
})

test('somebody already travelling is asked before somebody who leaves on Friday', () => {
  const found = tripStartingSoon(
    [trip('Porto', day(2), day(9)), trip('Sri Lanka', day(-1), day(6))],
    now
  )
  assert.equal(found.trip.title, 'Sri Lanka')
})

test('of the trips still to come, the soonest', () => {
  const found = tripStartingSoon([trip('Later', day(8), day(20)), trip('Sooner', day(3), day(6))], now)
  assert.equal(found.trip.title, 'Sooner')
})

test('an idea with no dates is not a trip anybody is about to take', () => {
  // Asking about these is the nagging that got the question ignored the
  // first time.
  assert.equal(tripStartingSoon([trip('Samoa', null, null)], now), null)
  assert.equal(tripStartingSoon([], now), null)
  assert.equal(tripStartingSoon(), null)
  assert.equal(tripStartingSoon([null, undefined], now), null)
})

test('the demo trip never asks for anything', () => {
  assert.equal(tripStartingSoon([trip('HK & South Korea', day(1), day(9), { is_demo: true })], now), null)
})

test('the wait is described the way a person would say it', () => {
  assert.equal(whenPhrase({ underway: true }), 'now')
  assert.equal(whenPhrase({ inDays: 0 }), 'today')
  assert.equal(whenPhrase({ inDays: 1 }), 'tomorrow')
  assert.equal(whenPhrase({ inDays: 6 }), 'in 6 days')
})

test('today is the local calendar day, not a UTC one', () => {
  // A trip starting "tomorrow" must not read as today because the server
  // thinks it is already past midnight somewhere else.
  assert.equal(today(new Date('2026-08-09T23:30:00')), '2026-08-09')
  assert.equal(today(new Date('2026-08-09T00:30:00')), '2026-08-09')
})
