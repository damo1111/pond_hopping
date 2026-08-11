import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GAP_HOURS, gapsIn, groundCovered, rowsFor, traceOf } from './tripTrace.js'

const ZONE = 'Europe/Rome'
const shot = (taken_at, lat = null, lon = null) => ({
  taken_at,
  lat,
  lon,
  taken_on: taken_at.slice(0, 10),
})

test('every photograph goes over, in order, at full precision', () => {
  // The version this replaces averaged each cluster to one point. The
  // sequence 12.4948, 12.4913, 12.4895 is somebody walking west towards
  // Piazza Venezia, and a centroid is the one thing that cannot say so.
  const rows = rowsFor(
    [
      shot('2024-01-23T12:23:19Z', 41.89616, 12.48949),
      shot('2024-01-23T12:16:30Z', 41.89703, 12.49475),
      shot('2024-01-23T12:20:34Z', 41.89649, 12.49129),
    ],
    ZONE
  )
  assert.deepEqual(rows.map((r) => r.at), ['13:16', '13:20', '13:23'])
  assert.deepEqual(rows.map((r) => r.lon), [12.49475, 12.49129, 12.48949])
})

test('a photograph that lost its fix still goes over', () => {
  // Two of these in the middle of a travel day are somebody on an
  // aeroplane. Dropping them is how the old pipeline lost the flight.
  const rows = rowsFor([shot('2024-01-22T17:04:46Z'), shot('2024-01-22T13:37:19Z', 55.7845, -3.77281)], ZONE)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].lat, null)
})

test('a long silence is named, not filled', () => {
  const rows = rowsFor(
    [shot('2024-01-23T07:52:00Z', 41.9, 12.5), shot('2024-01-23T12:16:00Z', 41.9, 12.5)],
    ZONE
  )
  const gaps = gapsIn(rows)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].from, '08:52')
  assert.equal(gaps[0].to, '13:16')
  assert.equal(gaps[0].minutes, 264)
})

test('a short silence is not a gap', () => {
  const rows = rowsFor(
    [shot('2024-01-23T12:00:00Z', 41.9, 12.5), shot('2024-01-23T13:00:00Z', 41.9, 12.5)],
    ZONE
  )
  assert.deepEqual(gapsIn(rows, GAP_HOURS), [])
})

test('ground covered is the straight lines, and skips the fixless', () => {
  // A floor, never a total: real streets curve and walking carries on
  // between photographs. Whoever uses it has to say so.
  const d = groundCovered([
    shot('2024-01-23T12:00:00Z', 41.9, 12.5),
    shot('2024-01-23T12:10:00Z'),
    shot('2024-01-23T12:20:00Z', 41.91, 12.5),
  ])
  assert.ok(d > 1 && d < 1.3, `expected about 1.1 km, got ${d}`)
})

test('a trip is days, and a day with only a flight is still a day', () => {
  const trace = traceOf([shot('2024-01-23T12:00:00Z', 41.9, 12.5)], { start_date: '2024-01-22' }, {
    zone: ZONE,
    flights: [
      {
        flight_number: 'BA546',
        dep_airport: 'LHR',
        arr_airport: 'FCO',
        dep_time: '2024-01-22T16:15:00+00:00',
        arr_time: '2024-01-22T18:32:00+00:00',
      },
    ],
  })
  assert.deepEqual(trace.days.map((d) => d.date), ['2024-01-22', '2024-01-23'])
  assert.equal(trace.days[0].photographs, 0)
  assert.equal(trace.days[0].flights[0].departed, '17:15')
  assert.equal(trace.days[1].day_number, 2)
  assert.equal(trace.photographs, 1)
})

test('the trace is the day, not a summary of it', () => {
  const many = Array.from({ length: 23 }, (_, i) =>
    shot(`2024-01-24T16:3${i % 10}:0${i % 10}Z`, 41.8965 + i * 0.00001, 12.4849)
  )
  const trace = traceOf(many, { start_date: '2024-01-24' }, { zone: ZONE })
  // Twenty-three photographs in ten minutes is deliberate photography of
  // something, and it only reads that way if all twenty-three are there.
  assert.equal(trace.days[0].trace.length, 23)
  assert.equal(trace.days[0].without_gps, 0)
})

test('a flight is not ground covered on foot', () => {
  // Day one of Rome is Scotland, Heathrow, then Rome, and summing the
  // straight lines gave 1,982 km. A model handed that will write that
  // somebody covered 1,982 km, and one sentence like that discredits the
  // 14.5 km on the day it is actually true of.
  const rows = [
    shot('2024-01-22T13:37:19Z', 55.7845, -3.77281),
    shot('2024-01-22T13:40:31Z', 55.58193, -3.86059),
    shot('2024-01-22T14:47:23Z', 51.47059, -0.48667),
    shot('2024-01-22T15:02:40Z', 51.47101, -0.48736),
    shot('2024-01-22T19:46:39Z', 41.89843, 12.49713),
    shot('2024-01-22T19:54:42Z', 41.89918, 12.49718),
  ]
  // Only the two walkable hops survive: across Terminal 5, and across Monti.
  // Twenty-three kilometres of Scotland in three minutes is a car.
  assert.ok(groundCovered(rows) <= 0.2, `expected a couple of hundred metres, got ${groundCovered(rows)}`)
})

// ── Where they actually were ──────────────────────────────────────────────

test('a timeline knows the hours the camera did not', () => {
  // The gap the story otherwise has to admit: nothing was photographed
  // between 08:52 and 13:16, and something was recording the whole time.
  const trace = traceOf([shot('2024-01-23T12:00:00Z', 41.9, 12.5)], { start_date: '2024-01-23' }, {
    zone: ZONE,
    tracks: [
      {
        track_date: '2024-01-23',
        visits: [
          { t: '09:10', e: '11:40', min: 150, lat: 41.90121, lon: 12.49554 },
          { t: '12:05', e: '13:02', min: 57, lat: 41.89843, lon: 12.49713 },
        ],
      },
    ],
  })
  const stayed = trace.days[0].stayed
  assert.equal(stayed.length, 2)
  assert.deepEqual(stayed[0], { from: '09:10', to: '11:40', minutes: 150, lat: 41.90121, lon: 12.49554, how: 'timeline' })
})

test('what the phone recorded itself counts the same', () => {
  const trace = traceOf([], { start_date: '2024-01-23' }, {
    zone: ZONE,
    visits: [
      {
        arrived_at: '2024-01-23T09:00:00Z',
        departed_at: '2024-01-23T10:30:00Z',
        lat: 41.9,
        lng: 12.5,
        source: 'auto',
      },
    ],
  })
  assert.deepEqual(trace.days[0].stayed, [
    { from: '10:00', to: '11:30', minutes: 90, lat: 41.9, lon: 12.5, how: 'recorded' },
  ])
})

test('a day nobody photographed but something recorded is still a day', () => {
  const trace = traceOf([], { start_date: '2024-01-22' }, {
    zone: ZONE,
    tracks: [{ track_date: '2024-01-24', visits: [{ t: '09:00', e: '10:00', min: 60, lat: 41.9, lon: 12.5 }] }],
  })
  assert.deepEqual(trace.days.map((d) => d.date), ['2024-01-24'])
  assert.equal(trace.days[0].photographs, 0)
  assert.equal(trace.days[0].stayed.length, 1)
})

test('both sources on one day are read in order, and neither is dropped', () => {
  const trace = traceOf([], { start_date: '2024-01-23' }, {
    zone: ZONE,
    tracks: [{ track_date: '2024-01-23', visits: [{ t: '14:00', e: '15:00', min: 60, lat: 41.9, lon: 12.5 }] }],
    visits: [{ arrived_at: '2024-01-23T07:00:00Z', departed_at: '2024-01-23T07:30:00Z', lat: 41.8, lng: 12.4 }],
  })
  assert.deepEqual(trace.days[0].stayed.map((s) => s.from), ['08:00', '14:00'])
  assert.deepEqual(trace.days[0].stayed.map((s) => s.how), ['recorded', 'timeline'])
})

test('a stay with no coordinate is not a stay', () => {
  const trace = traceOf([], { start_date: '2024-01-23' }, {
    zone: ZONE,
    tracks: [{ track_date: '2024-01-23', visits: [{ t: '14:00', e: '15:00', min: 60 }] }],
  })
  assert.deepEqual(trace.days[0].stayed, [])
})
