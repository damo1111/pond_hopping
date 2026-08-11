import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spanOf } from './dateRange.js'

const trip = (start_date, end_date = null) => ({ start_date, end_date })

test('a trip inside one month says the month once', () => {
  // The whole point. This was "22 January 2024 – 25 January 2024" in the
  // largest type on the recap screen.
  assert.equal(spanOf(trip('2024-01-22', '2024-01-25'), { long: true }), '22 – 25 January 2024')
})

test('and on a card, where there is no year to say', () => {
  assert.equal(spanOf(trip('2024-01-22', '2024-01-25')), '22 – 25 Jan')
})

test('crossing a month keeps both months and one year', () => {
  assert.equal(spanOf(trip('2024-01-28', '2024-02-03'), { long: true }), '28 January – 3 February 2024')
  assert.equal(spanOf(trip('2024-01-28', '2024-02-03')), '28 Jan – 3 Feb')
})

test('crossing a year says both years', () => {
  assert.equal(
    spanOf(trip('2023-12-28', '2024-01-03'), { long: true }),
    '28 December 2023 – 3 January 2024'
  )
})

test('one day is one date, whether the end is missing or the same', () => {
  assert.equal(spanOf(trip('2024-01-22'), { long: true }), '22 January 2024')
  assert.equal(spanOf(trip('2024-01-22', '2024-01-22'), { long: true }), '22 January 2024')
})

test('no dates at all says whatever the screen wants it to', () => {
  assert.equal(spanOf(null, { empty: 'dates tbc' }), 'dates tbc')
  assert.equal(spanOf({ start_date: null }, { empty: 'dates tbc' }), 'dates tbc')
  assert.equal(spanOf(trip('2024-01-22')), '22 Jan')
})

test('the day that goes in is the day that comes out, in any timezone', () => {
  // 'YYYY-MM-DD' parsed as midnight UTC and formatted in local time is the
  // day before, anywhere west of Greenwich. A trip starting on the 22nd was
  // shown as the 21st in New York.
  const was = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    assert.equal(spanOf(trip('2024-01-22', '2024-01-25'), { long: true }), '22 – 25 January 2024')
  } finally {
    process.env.TZ = was
  }
})
