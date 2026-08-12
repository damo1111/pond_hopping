import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENOUGH,
  STILL_WORTH_IT_MS,
  SUBJECTS,
  clockFace,
  dueNow,
  lookBackAt,
  oneLine,
  whenToSend,
  worthSending,
} from './dayLookBack.js'

// Rome, 23 January 2024, from the database: 117 photographs between 06:06
// and 20:14, and the seeing pass's own tally — 53 architecture, 18 street,
// 15 animal, 13 landscape, 5 interior, 4 document, 3 other, 2 each of food,
// drink and people. Rebuilt here at the right proportions rather than
// invented, because the point of the counts is that they are real.
const ROME_23 = (() => {
  const tally = {
    architecture: 53, street: 18, animal: 15, landscape: 13,
    interior: 5, document: 4, other: 3, food: 2, drink: 2, people: 2,
  }
  const out = []
  let n = 0
  for (const [subject, count] of Object.entries(tally)) {
    for (let i = 0; i < count; i++) {
      const minute = 6 * 60 + 6 + Math.round((n / 116) * (20 * 60 + 14 - (6 * 60 + 6)))
      out.push({
        taken_on: '2024-01-23',
        taken_at: `2024-01-23T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00Z`,
        // Walking pace around the centre: a few hundred metres between shots.
        lat: 41.89 + n * 0.0004,
        lon: 12.49 + n * 0.0002,
        city: 'Rome',
        seen: { subject, what: `a ${subject} in Rome`, weather: 'clear' },
      })
      n++
    }
  }
  return out
})()

test('the counts are of photographs, and every subject has a word for it', () => {
  const facts = lookBackAt('2024-01-23', ROME_23, { been: ['Rome'] })
  assert.equal(facts.photographs, 117)
  assert.equal(facts.counts.architecture, 53)
  assert.equal(facts.counts.animal, 15)
  assert.equal(facts.ranked[0].subject, 'architecture')
  assert.equal(facts.ranked[0].word, 'buildings')
  // Every value the seeing pass can return has a plural, or the recap says
  // "53 undefined".
  for (const { subject, word } of facts.ranked) assert.ok(word, `${subject} has no word`)
  assert.deepEqual(Object.keys(SUBJECTS).sort().includes('artwork'), true)
})

test('the day is bracketed by the clock the phone actually showed', () => {
  const facts = lookBackAt('2024-01-23', ROME_23, {})
  assert.equal(facts.from, '06:06')
  assert.equal(facts.to, '20:14')
  // Not converted into a zone. taken_at is mostly a local clock stamped as
  // UTC already, so reading it back in UTC returns what the phone showed.
  assert.equal(clockFace('2024-01-23T06:06:00Z'), '06:06')
})

test('kilometres on foot are a floor, and the flight is not walked', () => {
  const facts = lookBackAt('2024-01-23', ROME_23, {})
  assert.ok(facts.km_on_foot > 0, 'a day round Rome covers ground')
  // A hop nobody could have walked is excluded by groundCovered(), so a
  // travel day does not claim fifteen hundred kilometres on foot.
  const withFlight = lookBackAt('2024-01-22', [
    { taken_on: '2024-01-22', taken_at: '2024-01-22T15:55:00Z', lat: 51.47, lon: -0.48, seen: { subject: 'transport' } },
    { taken_on: '2024-01-22', taken_at: '2024-01-22T19:46:00Z', lat: 41.89, lon: 12.49, seen: { subject: 'street' } },
  ], {})
  assert.equal(withFlight.km_on_foot, 0)
})

test('somewhere new is noticed, and somewhere old is not', () => {
  const first = lookBackAt('2024-01-23', ROME_23, { been: ['Edinburgh', 'London'] })
  assert.deepEqual(first.first_time, ['Rome'])
  const again = lookBackAt('2024-01-23', ROME_23, { been: ['Rome'] })
  assert.deepEqual(again.first_time, [])
})

test('a quiet day is not worth a notification', () => {
  const quiet = lookBackAt('2024-01-23', ROME_23.slice(0, 3), { been: ['Rome'] })
  assert.equal(quiet.photographs, 3)
  assert.equal(worthSending(quiet), false)
  // But a flight always is, however few pictures were taken.
  const flew = lookBackAt('2024-01-23', ROME_23.slice(0, 3), {
    been: ['Rome'],
    flights: [{ dep_time: '2024-01-23T10:00:00Z', flight_number: 'BA546', dep_airport: 'LHR', arr_airport: 'FCO' }],
  })
  assert.equal(worthSending(flew), true)
  assert.ok(ENOUGH.photos > 3)
})

test('the lock screen gets the rarest thing first, and at most three', () => {
  const facts = lookBackAt('2024-01-23', ROME_23, {
    been: ['Edinburgh'],
    flights: [{ dep_time: '2024-01-23T08:00:00Z', flight_number: 'BA546', dep_airport: 'LHR', arr_airport: 'FCO' }],
  })
  const line = oneLine(facts)
  assert.ok(line.startsWith('Rome, for the first time'), line)
  assert.ok(line.includes('LHR to FCO'), line)
  assert.equal(line.split(' · ').length, 3)
  // Nothing to say gets nothing, rather than an empty notification.
  assert.equal(oneLine(lookBackAt('2024-01-23', [], {})), null)
})

test('nine in the evening is nine where they are', () => {
  // Rome in January is an hour ahead, so 21:00 there is 20:00 UTC.
  assert.equal(whenToSend('2024-01-23', 'Europe/Rome'), '2024-01-23T20:00:00.000Z')
  // Melbourne in April is ten ahead: 21:00 there is 11:00 UTC.
  assert.equal(whenToSend('2026-04-10', 'Australia/Melbourne'), '2026-04-10T11:00:00.000Z')
  // A bare offset works too, for a coordinate with no named zone.
  assert.equal(whenToSend('2024-01-23', 0), '2024-01-23T21:00:00.000Z')
})

// ── Is it nine o'clock where they are ────────────────────────────────────

test('nine in Rome is due at nine in Rome and not before', () => {
  const nine = Date.parse('2024-01-23T20:00:00Z')
  assert.equal(dueNow('2024-01-23', 'Europe/Rome', nine - 60_000).due, false, 'a minute early')
  assert.equal(dueNow('2024-01-23', 'Europe/Rome', nine).due, true)
  assert.equal(dueNow('2024-01-23', 'Europe/Rome', nine - 60_000).why, 'early')
})

// The tick is hourly, so being up to an hour late is the ordinary case.
test('an hour late is still tonight', () => {
  const nine = Date.parse('2024-01-23T20:00:00Z')
  assert.equal(dueNow('2024-01-23', 'Europe/Rome', nine + 59 * 60_000).due, true)
})

// A summary of your evening arriving at three in the morning is not late,
// it is wrong, and it wakes somebody up to tell them about yesterday.
test('the middle of the night is a missed evening, not a late one', () => {
  const nine = Date.parse('2024-01-23T20:00:00Z')
  const out = dueNow('2024-01-23', 'Europe/Rome', nine + STILL_WORTH_IT_MS + 1)
  assert.equal(out.due, false)
  assert.equal(out.why, 'late')
})

test('the two ends of the world do not collide', () => {
  // 21:00 in Auckland is the same UTC day; 21:00 in Los Angeles is the next.
  const nz = dueNow('2026-04-10', 'Pacific/Auckland', Date.parse('2026-04-10T09:00:00Z'))
  const la = dueNow('2026-04-10', 'America/Los_Angeles', Date.parse('2026-04-11T04:00:00Z'))
  assert.equal(nz.due, true, nz.at)
  assert.equal(la.due, true, la.at)
  // And neither is due at the other's moment.
  assert.equal(dueNow('2026-04-10', 'Pacific/Auckland', Date.parse('2026-04-11T04:00:00Z')).why, 'late')
  assert.equal(dueNow('2026-04-10', 'America/Los_Angeles', Date.parse('2026-04-10T09:00:00Z')).why, 'early')
})

// Every photograph taken with location off. There is no honest answer to
// "is it nine o'clock where they are", so it says so rather than guessing UTC.
test('a day with no fix anywhere in it is never due', () => {
  const out = dueNow('2024-01-23', null, Date.parse('2024-01-23T21:00:00Z'))
  assert.equal(out.due, false)
  assert.equal(out.why, 'nowhere')
  assert.equal(out.at, null)
})

test('a bare offset works as well as a named zone', () => {
  assert.equal(dueNow('2024-01-23', 0, Date.parse('2024-01-23T21:00:00Z')).due, true)
  assert.equal(dueNow('2024-01-23', 9, Date.parse('2024-01-23T12:00:00Z')).due, true)
})

test('no date is nowhere rather than a crash', () => {
  assert.doesNotThrow(() => dueNow(null, 'Europe/Rome', Date.now()))
  assert.equal(dueNow(null, 'Europe/Rome', Date.now()).due, false)
})

// ── Which end of a travel day it thinks you are in ───────────────────────
//
// This decides what time the evening arrives. Getting it from the wrong end
// of a flight is not a rounding error — Melbourne to Bangkok is four hours,
// so "nine in the evening" becomes five in the afternoon.
const flightDay = [
  { taken_at: '2026-04-03T07:10:00Z', lat: -37.66, lon: 144.84 }, // Melbourne
  { taken_at: '2026-04-03T21:40:00Z', lat: 13.69, lon: 100.75 },  // Bangkok
  { taken_at: '2026-04-03T14:20:00Z', lat: 2.75, lon: 101.71 },   // Kuala Lumpur
]

test('the zone is where the day ended, not where it started', () => {
  assert.equal(lookBackAt('2026-04-03', flightDay).zone, 'Asia/Bangkok')
})

// The rows come back from Postgres in no particular order, and the first
// version of this read whichever one happened to be first.
test('and does not depend on what order the rows arrived in', () => {
  const zones = new Set()
  for (const order of [flightDay, [...flightDay].reverse(), [flightDay[1], flightDay[0], flightDay[2]]]) {
    zones.add(lookBackAt('2026-04-03', order).zone)
  }
  assert.equal(zones.size, 1, [...zones].join(' / '))
})

test('a fix with no time is better than no fix at all', () => {
  assert.ok(lookBackAt('2026-04-03', [{ taken_on: '2026-04-03', lat: 13.69, lon: 100.75 }]).zone)
})

test('a day with no fix anywhere has no zone rather than a wrong one', () => {
  assert.equal(lookBackAt('2026-04-03', [{ taken_at: '2026-04-03T09:00:00Z' }]).zone, null)
})
