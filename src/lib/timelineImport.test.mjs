import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AWAY_KM,
  dayTracks,
  detectFormat,
  findHome,
  localDay,
  localTime,
  nearestPlace,
  parseLatLng,
  parseTimeline,
  placesIn,
  suggestTripTitle,
  summariseTrip,
  tripsFromTimeline,
} from './timelineImport.js'

const LONDON = [51.5074, -0.1278]
const LISBON = [38.7223, -9.1393]
const PORTO = [41.1579, -8.6291]

// The current on-device export, as Android writes it.
const visit = (day, [lat, lon], { from = '09:00', to = '17:00', off = 'Z' } = {}) => ({
  startTime: `${day}T${from}:00.000${off}`,
  endTime: `${day}T${to}:00.000${off}`,
  visit: { topCandidate: { placeLocation: { latLng: `${lat}°, ${lon}°` } }, probability: 0.9 },
})

const days = (from, n) =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10)
  )

const atHome = (from, n) => days(from, n).map((d) => visit(d, LONDON))
const away = (from, n, where = LISBON) => days(from, n).map((d) => visit(d, where))

// ------------------------------------------------------------------ shapes

test('every shape Google has shipped is recognised, and nonsense is not', () => {
  assert.equal(detectFormat({ semanticSegments: [visit('2024-01-01', LONDON)] }), 'segments')
  assert.equal(detectFormat([visit('2024-01-01', LONDON)]), 'segments')
  assert.equal(detectFormat({ timelineObjects: [{ placeVisit: {} }] }), 'timelineObjects')
  assert.equal(detectFormat({ locations: [{ latitudeE7: 515074000 }] }), 'records')
  assert.equal(detectFormat({ photos: [] }), 'unknown')
  assert.equal(detectFormat([]), 'empty')
})

test('a file that is not JSON at all fails softly', () => {
  const out = parseTimeline('<html>Sign in to Google</html>')
  assert.equal(out.format, 'unparseable')
  assert.deepEqual(out.stops, [])
})

test('coordinates are read from all four notations, and refused otherwise', () => {
  assert.deepEqual(parseLatLng('38.722300°, -9.139300°'), { lat: 38.7223, lon: -9.1393 })
  assert.deepEqual(parseLatLng('geo:38.7223,-9.1393'), { lat: 38.7223, lon: -9.1393 })
  assert.deepEqual(parseLatLng({ latitudeE7: 387223000, longitudeE7: -91393000 }), {
    lat: 38.7223,
    lon: -9.1393,
  })
  assert.deepEqual(parseLatLng({ latLng: '38.7223, -9.1393' }), { lat: 38.7223, lon: -9.1393 })
  // A coordinate we cannot read must not become [0, 0] — that is the
  // Atlantic, and it looks exactly like a real answer on a map.
  assert.equal(parseLatLng('somewhere nice'), null)
  assert.equal(parseLatLng(null), null)
  assert.equal(parseLatLng('999, 999'), null)
})

test('the day is the one the traveller was living in, not UTC', () => {
  // 9pm in Tokyo is still that day; UTC would file it as the day before.
  assert.equal(localDay('2024-06-30T21:15:00.000+09:00'), '2024-06-30')
  assert.equal(localDay('2024-06-30T23:30:00.000Z'), '2024-06-30')
  assert.equal(localTime('2024-06-30T21:15:00.000+09:00'), '21:15')
  assert.equal(localDay('not a time'), null)
})

test('the old Takeout shape yields the same stops as the new one', () => {
  const out = parseTimeline({
    timelineObjects: [
      {
        placeVisit: {
          location: { latitudeE7: 387223000, longitudeE7: -91393000, name: 'Time Out Market' },
          duration: { startTimestamp: '2024-03-12T12:00:00Z', endTimestamp: '2024-03-12T13:30:00Z' },
        },
      },
    ],
  })
  assert.equal(out.format, 'timelineObjects')
  assert.equal(out.stops.length, 1)
  assert.equal(out.stops[0].minutes, 90)
  assert.equal(out.stops[0].name, 'Time Out Market')
  assert.equal(out.stops[0].day, '2024-03-12')
})

test('raw records carry no stops, only points', () => {
  const out = parseTimeline({
    locations: [
      { latitudeE7: 515074000, longitudeE7: -1278000, timestampMs: '1710240000000' },
      { latitudeE7: 515074000, longitudeE7: -1278000, timestamp: '2024-03-12T13:00:00Z' },
    ],
  })
  assert.equal(out.format, 'records')
  assert.equal(out.stops.length, 0)
  assert.equal(out.points.length, 2)
})

test('a day of raw fixes is thinned, and its stops always survive', () => {
  const segments = [visit('2024-03-12', LISBON)]
  for (let i = 0; i < 900; i++) {
    segments.push({
      startTime: `2024-03-12T${String(Math.floor(i / 40)).padStart(2, '0')}:00:00Z`,
      timelinePath: [{ point: `geo:38.7,${-9.1 + i / 10000}` }],
    })
  }
  const out = parseTimeline({ semanticSegments: segments }, { maxPointsPerDay: 50 })
  assert.ok(out.points.length <= 50, `thinned to ${out.points.length}`)
  assert.equal(out.points.filter((p) => p.stop).length, 1)
})

// -------------------------------------------------------------------- home

test('home is the place with the most days, not the most fixes', () => {
  // Two weeks in Lisbon photographed relentlessly, a year in London barely
  // recorded at all. Days must win, or everybody moves abroad.
  const samples = [
    ...days('2024-01-01', 200).map((d) => ({ day: d, lat: LONDON[0], lon: LONDON[1] })),
    ...days('2024-07-01', 14).flatMap((d) =>
      Array.from({ length: 300 }, () => ({ day: d, lat: LISBON[0], lon: LISBON[1] }))
    ),
  ]
  const home = findHome(samples)
  assert.ok(Math.abs(home.lat - LONDON[0]) < 0.2, `got ${home.lat}`)
  assert.equal(home.days, 200)
})

test('no usable samples means no home, rather than a point in the sea', () => {
  assert.equal(findHome([]), null)
  assert.equal(findHome([{ lat: 1, lon: 2 }]), null) // no day
})

// ------------------------------------------------------------------- trips

test('a fortnight abroad inside a year at home is one trip', () => {
  const parsed = parseTimeline([
    ...atHome('2024-01-01', 30),
    ...away('2024-02-01', 14),
    ...atHome('2024-02-15', 30),
  ])
  const { trips, home } = tripsFromTimeline(parsed)
  assert.ok(Math.abs(home.lat - LONDON[0]) < 0.2)
  assert.equal(trips.length, 1)
  assert.equal(trips[0].start, '2024-02-01')
  assert.equal(trips[0].end, '2024-02-14')
  assert.equal(trips[0].nights, 13)
})

test('two trips separated by a day at home stay two trips', () => {
  const parsed = parseTimeline([
    ...atHome('2024-01-01', 20),
    ...away('2024-01-21', 5),
    ...atHome('2024-01-26', 1),
    ...away('2024-01-27', 5),
    ...atHome('2024-02-01', 20),
  ])
  const { trips } = tripsFromTimeline(parsed)
  assert.equal(trips.length, 2)
  assert.deepEqual(trips.map((t) => t.start), ['2024-01-21', '2024-01-27'])
})

test('a flat battery in the middle of a trip does not split it in two', () => {
  const parsed = parseTimeline([
    ...atHome('2024-01-01', 20),
    ...away('2024-01-21', 4),
    // 25th: nothing at all — phone dead, or in a bag on a beach.
    ...away('2024-01-26', 4),
    ...atHome('2024-02-01', 20),
  ])
  const { trips } = tripsFromTimeline(parsed)
  assert.equal(trips.length, 1)
  assert.equal(trips[0].start, '2024-01-21')
  assert.equal(trips[0].end, '2024-01-29')
})

test('a longer silence is not bridged — the file cannot support the guess', () => {
  const parsed = parseTimeline([
    ...atHome('2024-01-01', 20),
    ...away('2024-01-21', 4),
    // Four blank days.
    ...away('2024-01-29', 4),
    ...atHome('2024-02-05', 20),
  ])
  const { trips } = tripsFromTimeline(parsed)
  assert.equal(trips.length, 2)
})

test('a day out is kept apart from the trips, not silently dropped', () => {
  const parsed = parseTimeline([
    ...atHome('2024-01-01', 20),
    ...away('2024-01-21', 1, PORTO),
    ...atHome('2024-01-22', 20),
  ])
  const { trips, dayTrips } = tripsFromTimeline(parsed)
  assert.equal(trips.length, 0)
  assert.equal(dayTrips.length, 1)
  assert.equal(dayTrips[0].nights, 0)
})

test('the commute is not a trip', () => {
  // Somewhere well inside the away threshold, every working day.
  const near = [LONDON[0] + 0.4, LONDON[1] + 0.4]
  const parsed = parseTimeline([
    ...atHome('2024-01-01', 10),
    ...days('2024-01-11', 5).map((d) => visit(d, near)),
    ...atHome('2024-01-16', 10),
  ])
  const { trips, dayTrips } = tripsFromTimeline(parsed)
  assert.equal(trips.length + dayTrips.length, 0)
})

test('the away threshold is what decides, and it is adjustable', () => {
  const parsed = parseTimeline([...atHome('2024-01-01', 20), ...away('2024-01-21', 5, PORTO)])
  assert.equal(tripsFromTimeline(parsed, { awayKm: AWAY_KM }).trips.length, 1)
  // Push it past the distance to Porto and the same file has no trips in it.
  assert.equal(tripsFromTimeline(parsed, { awayKm: 3000 }).trips.length, 0)
})

test('an empty or unreadable file produces nothing, and does not throw', () => {
  assert.deepEqual(tripsFromTimeline({ stops: [], points: [] }).trips, [])
  assert.deepEqual(tripsFromTimeline(null).trips, [])
})

// ------------------------------------------------------------------ naming

test('places are named from the airport table already in the bundle', () => {
  assert.equal(nearestPlace(LISBON[0], LISBON[1]).name, 'Lisbon')
  assert.equal(nearestPlace(PORTO[0], PORTO[1]).name, 'Porto')
  // The middle of the Atlantic has no airport, and gets no invented name.
  assert.equal(nearestPlace(30, -40), null)
})

test('a trip is named after where it was spent, most-dwelt-in first', () => {
  const parsed = parseTimeline([
    ...atHome('2024-01-01', 20),
    ...away('2024-01-21', 5, LISBON),
    ...away('2024-01-26', 2, PORTO),
    ...atHome('2024-02-01', 10),
  ])
  const { trips } = tripsFromTimeline(parsed)
  assert.equal(trips.length, 1)
  assert.equal(suggestTripTitle(trips[0]), 'Lisbon & Porto')
  assert.match(summariseTrip(trips[0]), /21 Jan 2024 – 27 Jan 2024 · 6 nights · Lisbon, Porto/)
})

test('a trip is never named after home', () => {
  // Both travel days start and end at home: the drive to the airport, the
  // supermarket on the way back. Left in, they name the trip "London".
  const parsed = parseTimeline([
    ...atHome('2024-01-01', 20),
    ...days('2024-01-21', 6).flatMap((d) => [visit(d, LONDON, { from: '07:00', to: '08:00' }), visit(d, LISBON)]),
    ...atHome('2024-02-01', 10),
  ])
  const { trips } = tripsFromTimeline(parsed)
  assert.equal(suggestTripTitle(trips[0]), 'Lisbon')
  assert.deepEqual(trips[0].places.map((p) => p.name), ['Lisbon'])
})

test('somewhere unnamed falls back to a month, never to a wrong city', () => {
  const nowhere = [-25.5, 128.5] // Australian desert, no airport in range
  const parsed = parseTimeline([...atHome('2024-01-01', 20), ...away('2024-01-21', 4, nowhere)])
  const { trips } = tripsFromTimeline(parsed)
  assert.equal(suggestTripTitle(trips[0]), 'January 2024')
  assert.match(summariseTrip(trips[0]), /km from home/)
  assert.equal(suggestTripTitle(null), 'A trip')
})

test('a named place from the export beats the nearest airport', () => {
  const stops = [{ lat: LISBON[0], lon: LISBON[1], day: '2024-01-01', minutes: 60, name: 'Belém' }]
  assert.equal(placesIn(stops)[0].name, 'Belém')
})

// -------------------------------------------------------------- day tracks

test('each day becomes a track the existing day map can draw', () => {
  const parsed = parseTimeline([
    ...atHome('2024-01-01', 20),
    visit('2024-01-21', LISBON, { from: '09:00', to: '10:30' }),
    visit('2024-01-21', PORTO, { from: '14:00', to: '18:00' }),
    ...away('2024-01-22', 3),
  ])
  const { trips } = tripsFromTimeline(parsed)
  const tracks = dayTracks(trips[0])
  const first = tracks.find((t) => t.track_date === '2024-01-21')
  assert.equal(first.path.length, 2)
  assert.deepEqual(first.visits[0], {
    lat: LISBON[0],
    lon: LISBON[1],
    t: '09:00',
    e: '10:30',
    min: 90,
  })
  assert.equal(first.visits[1].min, 240)
})

test('a stationary phone jittering does not become a scribble', () => {
  const segments = [visit('2024-01-21', LISBON)]
  for (let i = 0; i < 20; i++) {
    segments.push({
      startTime: `2024-01-21T1${i % 10}:00:00Z`,
      timelinePath: [{ point: `geo:${LISBON[0] + i * 0.00002},${LISBON[1]}` }], // ~2m apart
    })
  }
  const { trips } = tripsFromTimeline(
    parseTimeline([...atHome('2024-01-01', 20), ...segments, ...away('2024-01-22', 3)])
  )
  const track = dayTracks(trips[0]).find((t) => t.track_date === '2024-01-21')
  assert.equal(track.path.length, 1)
})

test('a stop too brief to be a stop is not drawn as one', () => {
  const parsed = parseTimeline([
    ...atHome('2024-01-01', 20),
    visit('2024-01-21', LISBON, { from: '09:00', to: '09:03' }),
    ...away('2024-01-22', 3),
  ])
  const { trips } = tripsFromTimeline(parsed)
  const track = dayTracks(trips[0]).find((t) => t.track_date === '2024-01-21')
  assert.equal(track, undefined)
})
