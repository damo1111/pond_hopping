import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tellDay, tellFlight, tellRun, titleDay } from './tellIt.js'

const ROME = 'Europe/Rome'

// Rome, 23 January 2024 — the real numbers, from the real tables.
const RUN = { run_date: '2024-01-23', distance_km: '21.39', pace: '4:50', elevation_m: 178 }
const BA546 = { flight_number: 'BA546', dep_airport: 'LHR', arr_airport: 'FCO', dep_time: '2024-01-22T16:15:00Z', arr_time: '2024-01-22T18:32:00Z' }

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

test('a travel day says when you finally got there', () => {
  // Rome's first day: Scotland at 14:37, Heathrow from 15:47, airborne at
  // 18:04, central Rome by 20:46 — and not one segment lasting twenty
  // minutes, so the twenty-minute rule erased the entire day and left
  // "LHR to FCO on BA546". On a travel day nobody lingers; the moving is
  // the day.
  const day = {
    segments: [
      { from: '2024-01-22T13:37:00Z', minutes: 3, stayed: false },
      { from: '2024-01-22T14:47:00Z', minutes: 15, stayed: false },
      { from: '2024-01-22T19:46:00Z', minutes: 8, stayed: false },
      { from: '2024-01-22T20:45:00Z', minutes: 0, stayed: false },
    ],
  }
  const said = tellDay(day, {}, { flights: [BA546] }, ROME)
  assert.match(said, /LHR to FCO/)
  // 20:46 is the first photograph after the aeroplane landed. 21:45 is the
  // last photograph of the night, which is a different fact.
  assert.match(said, /20:46/)
  assert.doesNotMatch(said, /21:45/)
})

test('and names where it got to, when the lookup found one', () => {
  const day = { segments: [{ from: '2024-01-22T19:46:00Z', minutes: 8, stayed: false }] }
  assert.match(tellDay(day, { 0: 'Monti' }, { flights: [BA546] }, ROME), /At Monti by 20:46/)
})

test('an ordinary day does not get the arrival line', () => {
  const day = { segments: [{ from: '2024-01-23T12:16:00Z', minutes: 114, stayed: true }] }
  const said = tellDay(day, { 0: 'the Roman Forum' }, {}, ROME)
  assert.doesNotMatch(said, /Out and about by/)
})

test('"nowhere named" is not said when nothing at all was named', () => {
  // On its own it is the app apologising rather than telling you anything.
  const day = { from: '2024-01-23T06:06:00Z', to: '2024-01-23T20:00:00Z', segments: [
    { from: '2024-01-23T12:16:00Z', minutes: 114, stayed: true },
    { from: '2024-01-23T15:30:00Z', minutes: 40, stayed: true },
  ] }
  assert.doesNotMatch(tellDay(day, {}, {}, ROME), /no name for/)
})

// ── The weather, on the days it was the day ──────────────────────────────

const MILD = ['2024-01-21', '2024-01-22', '2024-01-23', '2024-01-24'].map((on_date) => ({
  on_date, high_c: 12, low_c: 5, code: 1, wind_kmh: 14, rain_mm: 0,
}))

test('an ordinary day says nothing about the weather', () => {
  // The symbol beside the entry already covers it. A story that mentions the
  // weather every day is a weather report.
  const day = { date: '2024-01-23', segments: [seg(8, 6, 44), seg(14, 16, 114)] }
  const said = tellDay(day, { 1: 'the Pantheon' }, { runs: [RUN], weather: MILD }, ROME)
  assert.ok(!/wind|rain|degrees|typhoon|storm|snow/i.test(said), said)
})

test('the day of the typhoon leads with the typhoon', () => {
  // "There was a typhoon on my last day." It is the sentence somebody leads
  // with four years later, so it leads here — burying it under the morning's
  // coffee stop would be telling the day in the wrong order.
  const day = { date: '2024-01-23', segments: [seg(8, 6, 44), seg(14, 16, 114)] }
  const storm = { on_date: '2024-01-23', lat: 35.7, lon: 139.7, high_c: 24, low_c: 20, code: 95, wind_kmh: 131, rain_mm: 96 }
  const forecast = [...MILD.filter((d) => d.on_date !== '2024-01-23'), storm]
  const said = tellDay(day, { 1: 'the Pantheon' }, { runs: [RUN], weather: forecast }, ROME)
  assert.match(said, /^The edge of a typhoon — 131 km\/h of wind\./)
  // And the rest of the day is still there, under it.
  assert.match(said, /21\.4 km run/)
  assert.match(said, /the Pantheon/)
})

test('a smaller weather day sets the scene rather than leading', () => {
  const day = { date: '2024-01-23', segments: [seg(8, 6, 44)] }
  const wet = { on_date: '2024-01-23', lat: 41.9, lon: 12.5, high_c: 11, code: 63, wind_kmh: 20, rain_mm: 31 }
  const forecast = [...MILD.filter((d) => d.on_date !== '2024-01-23'), wet]
  const said = tellDay(day, { 0: 'the Pantheon' }, { runs: [RUN], weather: forecast }, ROME)
  assert.match(said, /^A 21\.4 km run/)
  assert.match(said, /31mm of rain/)
})

test('a day with no weather recorded is unchanged', () => {
  // Every trip before this shipped has rows with no wind reading at all.
  const day = { date: '2024-01-23', segments: [seg(8, 6, 44)] }
  const bare = tellDay(day, { 0: 'the Pantheon' }, { runs: [RUN] }, ROME)
  const empty = tellDay(day, { 0: 'the Pantheon' }, { runs: [RUN], weather: [] }, ROME)
  const halfway = tellDay(
    day,
    { 0: 'the Pantheon' },
    { runs: [RUN], weather: [{ on_date: '2024-01-23', high_c: 12, code: 1 }] },
    ROME
  )
  assert.equal(bare, empty)
  assert.equal(bare, halfway)
})
