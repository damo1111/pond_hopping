import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tripShape, nameFor, slugFor } from './tripFromBooking.js'

const flight = (date, city, extra = {}) => ({ kind: 'flight', event_date: date, city, ...extra })
const stay = (from, to, city) => ({ kind: 'hotel', event_date: from, end_date: to, city })

test('nothing datable is not a trip', () => {
  assert.equal(tripShape([]), null)
  assert.equal(tripShape([{ kind: 'flight', title: 'no date' }]), null)
  assert.equal(tripShape(null), null)
})

test('one booking is a one-day trip, not an open-ended one', () => {
  const t = tripShape([flight('2026-10-09', 'Lisbon')])
  assert.equal(t.start_date, '2026-10-09')
  assert.equal(t.end_date, '2026-10-09')
})

// The one that matters: a checkout date is a day the trip is still happening,
// and a flight has no end_date at all. Reading only event_date ends a
// five-night stay on the day you arrive.
test('a stay ends the trip on its checkout, not its check-in', () => {
  const t = tripShape([
    flight('2026-10-09', 'Lisbon'),
    stay('2026-10-09', '2026-10-15', 'Lisbon'),
  ])
  assert.equal(t.start_date, '2026-10-09')
  assert.equal(t.end_date, '2026-10-15')
})

test('the window covers every booking whatever order they were found in', () => {
  const t = tripShape([
    flight('2026-10-15', 'Porto'),
    stay('2026-10-11', '2026-10-15', 'Porto'),
    flight('2026-10-09', 'Lisbon'),
  ])
  assert.equal(t.start_date, '2026-10-09')
  assert.equal(t.end_date, '2026-10-15')
})

// A cancelled outbound would otherwise drag the start back to a day nobody
// travels, and every day map and photo match keys off that window.
test('a cancelled booking does not decide when the trip starts', () => {
  const t = tripShape([
    { ...flight('2026-10-01', 'Lisbon'), action: 'cancel' },
    flight('2026-10-09', 'Lisbon'),
    stay('2026-10-09', '2026-10-12', 'Lisbon'),
  ])
  assert.equal(t.start_date, '2026-10-09')
})

test('a paste that is nothing but cancellations still makes a trip out of them', () => {
  const t = tripShape([{ ...flight('2026-10-01', 'Lisbon'), action: 'cancel' }])
  assert.equal(t.start_date, '2026-10-01')
})

test('it is named after the city that comes up most', () => {
  assert.equal(
    nameFor([flight('2026-10-09', 'Lisbon'), stay('2026-10-09', '2026-10-14', 'Lisbon'), flight('2026-10-14', 'Porto')]),
    'Lisbon',
  )
})

test('a tie is broken by whichever was seen first, so arrivals win over departures', () => {
  assert.equal(nameFor([flight('2026-10-09', 'Lisbon'), flight('2026-10-15', 'Porto')]), 'Lisbon')
})

test('an arrival city on a flight counts when the item has no city of its own', () => {
  assert.equal(nameFor([{ kind: 'flight', event_date: '2026-10-09', detail: { arr_city: 'Reykjavík' } }]), 'Reykjavík')
})

test('nothing named a place, so the date names it', () => {
  assert.match(nameFor([{ kind: 'activity', event_date: '2026-10-09' }], '2026-10-09'), /9 Oct/)
})

test('slugs are url-safe and unique per trip', () => {
  assert.equal(slugFor('Reykjavík & Vík', 0), 'reykjav-k-v-k-0')
  assert.notEqual(slugFor('Lisbon', 1), slugFor('Lisbon', 2))
})

test('a title of nothing but punctuation still yields a usable slug', () => {
  assert.match(slugFor('———', 5), /^trip-/)
})
