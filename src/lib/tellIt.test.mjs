import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tellDay, tellFlight, tellRun, titleDay } from './tellIt.js'

const ROME = 'Europe/Rome'

// Rome, 23 January 2024 — the real numbers, from the real tables.
const RUN = { run_date: '2024-01-23', distance_km: '21.39', pace: '4:50', elevation_m: 178 }
const BA546 = { flight_number: 'BA546', dep_airport: 'LHR', arr_airport: 'FCO', dep_time: '2024-01-22T16:15:00Z' }

const seg = (fromH, fromM, minutes, stayed = true) => ({
  from: `2024-01-23T${String(fromH - 1).padStart(2, '0')}:${String(fromM).padStart(2, '0')}:00Z`,
  minutes,
  stayed,
})

test('the run is the headline, because it is the best fact about the day', () => {
  // The failure this file exists for: the reconstruction said "The evening
  // at La Cenatio Rotunda" about a day that began with a half marathon
  // already sitting in the database.
  const said = tellRun(RUN)
  assert.match(said, /21\.4 km/)
  assert.match(said, /4:50 pace/)
  assert.match(said, /178 m of climb/)
})

test('a run with no distance is not a run', () => {
  assert.equal(tellRun({ distance_km: null }), null)
  assert.equal(tellRun(null), null)
})

test('a flight is said in the trip’s own time', () => {
  assert.equal(tellFlight(BA546, ROME), 'LHR to FCO on BA546 at 17:15.')
})

test('a day says what is known before what is guessed', () => {
  const day = { date: '2024-01-23', segments: [seg(8, 6, 44), seg(14, 16, 114)] }
  const said = tellDay(day, { 1: 'the Pantheon' }, { runs: [RUN], flights: [] }, ROME)
  assert.match(said, /^A 21\.4 km run/)
  assert.match(said, /the Pantheon/)
})

test('a travel day is a travel day', () => {
  const day = { date: '2024-01-22', segments: [seg(15, 37, 30)] }
  const said = tellDay(day, {}, { flights: [BA546] }, ROME)
  assert.match(said, /LHR to FCO/)
  assert.equal(titleDay(day, {}, { flights: [BA546] }), 'To FCO')
})

test('places you walked past are not in the day at all', () => {
  // Twenty stops of piazza soup became seven segments; only the ones you
  // stayed at are said, and this is where that is enforced.
  const day = {
    segments: [seg(14, 16, 114), seg(9, 51, 2, false), seg(17, 30, 40)],
  }
  const said = tellDay(day, { 0: 'the Pantheon', 1: 'Piazza del Parlamento', 2: 'the Trevi Fountain' }, {}, ROME)
  assert.match(said, /the Pantheon/)
  assert.match(said, /Trevi/)
  assert.doesNotMatch(said, /Parlamento/)
})

test('and a sentence never runs to eight places', () => {
  const segments = Array.from({ length: 9 }, (_, i) => seg(10 + i, 0, 30))
  const names = Object.fromEntries(segments.map((_, i) => [i, `Place ${i}`]))
  const said = tellDay({ segments }, names, {}, ROME)
  // first + longest + at most three others
  assert.ok((said.match(/Place \d/g) ?? []).length <= 5, said)
})

test('stops with no name are counted once, not listed', () => {
  const day = { segments: [seg(14, 16, 60), seg(16, 0, 30), seg(18, 0, 30)] }
  const said = tellDay(day, { 0: 'the Pantheon' }, {}, ROME)
  assert.match(said, /2 more stops the map has no name for/)
})

test('a day with nothing at all still says something true', () => {
  const said = tellDay({ from: '2024-01-23T06:06:00Z', to: '2024-01-23T20:14:00Z', segments: [] }, {}, {}, ROME)
  assert.match(said, /07:06/)
  assert.match(said, /Nothing along the way is on the map/)
})

test('the title is the day, not its number', () => {
  const day = { day_number: 2, segments: [seg(14, 16, 114), seg(17, 30, 40)] }
  assert.equal(titleDay(day, { 0: 'the Pantheon', 1: 'the Trevi Fountain' }, {}), 'the Pantheon and the Trevi Fountain')
  // A day whose only fact is the run is named for the run.
  assert.equal(titleDay({ day_number: 2, segments: [] }, {}, { runs: [RUN] }), '21.4 km')
})
