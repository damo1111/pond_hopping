import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockIn, hourIn, offsetFromLongitude, standardOffset, zoneFor } from './localTime.js'

// The real Rome numbers. 06:06:49Z is 07:06 in Rome, and this is the exact
// case that came out as "the evening, from 17:09" when rendered in
// Melbourne — the bug this file exists to make impossible.
const ROME_MORNING = '2024-01-23T06:06:49Z'
const ROME_NIGHT = '2024-01-23T20:14:12Z'

test('a Roman morning is a morning', () => {
  assert.equal(clockIn(ROME_MORNING, 'Europe/Rome'), '07:06')
  assert.equal(hourIn(ROME_MORNING, 'Europe/Rome'), 7)
})

test('and a Roman evening is an evening', () => {
  assert.equal(clockIn(ROME_NIGHT, 'Europe/Rome'), '21:14')
  assert.equal(hourIn(ROME_NIGHT, 'Europe/Rome'), 21)
})

test('longitude gets close enough on its own', () => {
  // Rome is 12.5°E. No timezone database, no flight, still a morning.
  assert.equal(offsetFromLongitude(12.49), 1)
  assert.equal(clockIn(ROME_MORNING, 1), '07:06')
  assert.equal(hourIn(ROME_MORNING, 1), 7)
})

test('and works on the other side of the world and the wrong side of zero', () => {
  assert.equal(offsetFromLongitude(144.96), 10) // Melbourne
  assert.equal(offsetFromLongitude(-74), -5) // New York
  assert.equal(offsetFromLongitude(0), 0)
  assert.equal(offsetFromLongitude(null), null)
})

test('the photographs decide, and the airports only name it', () => {
  // Rome's real flights: LHR->FCO out, FCO->LHR home. Both legs touch
  // London, and the *arrival* of the return leg is London — which is how
  // the first version of this returned Europe/London for a Roman holiday.
  const rome = [
    { dep_airport: 'LHR', arr_airport: 'FCO' },
    { dep_airport: 'FCO', arr_airport: 'LHR' },
  ]
  assert.equal(zoneFor({ flights: rome, lon: 12.49, when: '2024-01-23' }), 'Europe/Rome')
})

test('and a named zone is preferred over a bare offset, for the DST it knows', () => {
  // Rome is +2 in July; its longitude says +1. Matching on the offset in
  // force that day would have picked Europe/London, which is +1 in July —
  // so the match is on standard time, which is what longitude describes.
  const z = zoneFor({ flights: [{ arr_airport: 'FCO' }, { arr_airport: 'LHR' }], lon: 12.49, when: '2024-07-15' })
  assert.equal(z, 'Europe/Rome')
  // And having named it, the summer hour is right.
  assert.equal(clockIn('2024-07-15T06:06:49Z', z), '08:06')
})

test('standard time is the lesser of the two, in either hemisphere', () => {
  assert.equal(standardOffset('Europe/Rome'), 1)
  assert.equal(standardOffset('Europe/London'), 0)
  // Australia's summer is January. Standard is still the smaller number.
  assert.equal(standardOffset('Australia/Melbourne'), 10)
  assert.equal(standardOffset('Asia/Tokyo'), 9) // no daylight saving at all
})

test('an airport nobody has mapped falls through to the coordinates', () => {
  assert.equal(zoneFor({ flights: [{ arr_airport: 'ZZZ' }], lon: 12.49 }), 1)
})

test('coordinates with no matching airport still answer', () => {
  // A road trip with no flights at all is still somewhere.
  assert.equal(zoneFor({ flights: [], lon: 144.96 }), 10)
})

test('and nothing at all is null rather than a wrong guess', () => {
  assert.equal(zoneFor({}), null)
  assert.equal(zoneFor({ flights: [], lon: null }), null)
})

test('no timezone at all still renders UTC rather than the reader', () => {
  // The important property: never silently the machine's own timezone.
  assert.equal(clockIn(ROME_MORNING, null), '06:06')
  assert.equal(clockIn('', 'Europe/Rome'), '')
})
