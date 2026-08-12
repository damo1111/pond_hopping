import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ENOUGH, SUBJECTS, clockFace, lookBackAt, oneLine, whenToSend, worthSending } from './dayLookBack.js'

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
