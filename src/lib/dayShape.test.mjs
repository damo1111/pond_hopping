import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FAR_METRES, GAP_MINUTES, STAYED_MINUTES, knownOn, segment, worthNaming } from './dayShape.js'

const PANTHEON = { lat: 41.8986, lon: 12.4769 }
const COLOSSEUM = { lat: 41.8902, lon: 12.4922 }

const shot = (t, where = PANTHEON) => ({
  id: t,
  taken_at: `2024-01-23T${t}:00Z`,
  lat: where?.lat ?? null,
  lon: where?.lon ?? null,
})

// Photographs at a place you are actually at come every few minutes — the
// real Rome afternoon was 58 of them across 114 minutes. A fixture with
// half-hour holes in it is not a visit, it is several.
function during(fromH, fromM, minutes, where = PANTHEON, every = 6) {
  const marks = []
  for (let m = 0; m < minutes; m += every) marks.push(m)
  // Always land on the last minute, so a fixture that says 44 minutes is
  // 44 minutes rather than however far the step happened to reach.
  if (marks[marks.length - 1] !== minutes) marks.push(minutes)
  return marks.map((m) => {
    const total = fromH * 60 + fromM + m
    return shot(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`, where)
  })
}

test('photographs taken close together in time are one stop', () => {
  // The Rome failure: walking round one place crosses 150m constantly, and
  // distance-first turned that into a dozen stops.
  const segs = segment(during(13, 16, 114))
  assert.equal(segs.length, 1)
  assert.equal(segs[0].minutes, 114)
  assert.equal(segs[0].stayed, true)
})

test('a long gap is somewhere else', () => {
  // Rome's real day 2: a run, then nothing until the afternoon.
  const segs = segment([...during(7, 6, 44), ...during(13, 16, 114)])
  assert.equal(segs.length, 2)
  assert.deepEqual(segs.map((s) => s.minutes), [44, 114])
})

test('and so is a distance you cannot have walked', () => {
  // Two minutes apart and a mile and a half away: that was a taxi.
  const segs = segment([shot('13:00', PANTHEON), shot('13:02', COLOSSEUM)])
  assert.equal(segs.length, 2)
})

test('but drifting round one place is not a journey', () => {
  // 150m apart — the old threshold — and obviously the same visit.
  const nearby = { lat: PANTHEON.lat + 0.0014, lon: PANTHEON.lon }
  assert.equal(segment([shot('13:00'), shot('13:10', nearby)]).length, 1)
})

test('somewhere you passed through is not somewhere you went', () => {
  const segs = segment([shot('08:51'), shot('08:52')])
  assert.equal(segs[0].stayed, false)
  assert.deepEqual(worthNaming(segs), [])
})

test('only the places you stayed are worth a lookup', () => {
  // The whole cost argument. Rome day 2 was 20 stops looked up; this is
  // the rule that makes it four.
  const segs = segment([
    ...during(7, 6, 44),      // the run — stayed
    ...during(8, 51, 1),      // passing through
    ...during(13, 16, 114),   // the afternoon — stayed
  ])
  assert.equal(segs.length, 3)
  assert.equal(worthNaming(segs).length, 2)
})

test('a photograph with no location still belongs to its stop', () => {
  const segs = segment([shot('13:00'), shot('13:10', null), shot('13:30')])
  assert.equal(segs.length, 1)
  assert.equal(segs[0].photos.length, 3)
})

test('the constants are real quantities, not tuning noise', () => {
  assert.ok(GAP_MINUTES >= 15 && GAP_MINUTES <= 45)
  assert.ok(FAR_METRES >= 300)
  assert.ok(STAYED_MINUTES > 0 && STAYED_MINUTES <= GAP_MINUTES)
})

test('what the app already knows about a day', () => {
  // The half marathon that the photograph-only version never mentioned.
  const runs = [{ run_date: '2024-01-23', distance_km: '21.39', pace: '4:50' }, { run_date: '2024-01-24' }]
  const flights = [{ dep_time: '2024-01-22 16:15:00+00', flight_number: 'BA546' }]
  assert.equal(knownOn('2024-01-23', { runs, flights }).runs.length, 1)
  assert.equal(knownOn('2024-01-23', { runs, flights }).flights.length, 0)
  assert.equal(knownOn('2024-01-22', { runs, flights }).flights[0].flight_number, 'BA546')
})

test('a day with nothing known about it is not an error', () => {
  assert.deepEqual(knownOn('2024-01-23', {}), { runs: [], flights: [], weather: [] })
  assert.deepEqual(segment([]), [])
  assert.deepEqual(worthNaming([]), [])
})
