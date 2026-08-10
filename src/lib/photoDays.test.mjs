import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RECONSTRUCTED, STOP_METRES, daysFrom, describeDay, draftEntry, metresApart, stopsIn } from './photoDays.js'

// The Colosseum and the Trevi Fountain, roughly — about 1.4km apart.
const COLOSSEUM = { lat: 41.8902, lon: 12.4922 }
const TREVI = { lat: 41.9009, lon: 12.4833 }

const shot = (taken_at, where = COLOSSEUM, taken_on = '2024-01-23') => ({
  id: taken_at,
  taken_at,
  taken_on,
  lat: where?.lat ?? null,
  lon: where?.lon ?? null,
})

test('metres between two points is a real distance', () => {
  const d = metresApart(COLOSSEUM, TREVI)
  assert.ok(d > 1200 && d < 1600, `${d}m`)
  assert.equal(Math.round(metresApart(COLOSSEUM, COLOSSEUM)), 0)
})

test('a point with no coordinates is infinitely far from anything', () => {
  assert.equal(metresApart(COLOSSEUM, { lat: null, lon: null }), Infinity)
  assert.equal(metresApart(null, COLOSSEUM), Infinity)
})

test('photographs in one place are one stop', () => {
  const stops = stopsIn([
    shot('2024-01-23T10:00:00Z'),
    shot('2024-01-23T10:20:00Z'),
    shot('2024-01-23T10:40:00Z'),
  ])
  assert.equal(stops.length, 1)
  assert.equal(stops[0].photos.length, 3)
  assert.equal(stops[0].minutes, 40)
  assert.equal(stops[0].lingered, true)
})

test('and a walk across town is two', () => {
  const stops = stopsIn([
    shot('2024-01-23T10:00:00Z', COLOSSEUM),
    shot('2024-01-23T10:20:00Z', COLOSSEUM),
    shot('2024-01-23T12:00:00Z', TREVI),
    shot('2024-01-23T12:30:00Z', TREVI),
  ])
  assert.equal(stops.length, 2)
  assert.deepEqual(stops.map((s) => s.photos.length), [2, 2])
})

test('a few steps down the street is still the same place', () => {
  // Two photographs of one building from opposite corners must not read as
  // two separate visits.
  const nearby = { lat: COLOSSEUM.lat + 0.0005, lon: COLOSSEUM.lon }
  assert.ok(metresApart(COLOSSEUM, nearby) < STOP_METRES)
  assert.equal(stopsIn([shot('2024-01-23T10:00:00Z'), shot('2024-01-23T10:05:00Z', nearby)]).length, 1)
})

test('a photograph with no location belongs to wherever you were', () => {
  // Taken between two located ones, so that is where it was — even though
  // it cannot say so itself.
  const stops = stopsIn([
    shot('2024-01-23T10:00:00Z', COLOSSEUM),
    shot('2024-01-23T10:10:00Z', null),
    shot('2024-01-23T10:20:00Z', COLOSSEUM),
  ])
  assert.equal(stops.length, 1)
  assert.equal(stops[0].photos.length, 3)
})

test('photographs with no time are not evidence of a stop', () => {
  assert.deepEqual(stopsIn([{ id: 1, lat: 41.9, lon: 12.5 }]), [])
  assert.deepEqual(stopsIn([]), [])
})

test('a passing snap is a stop, but not a lingering one', () => {
  const stops = stopsIn([shot('2024-01-23T10:00:00Z'), shot('2024-01-23T10:03:00Z')])
  assert.equal(stops[0].lingered, false)
})

test('days come out in order, numbered from the trip start', () => {
  const days = daysFrom(
    [
      shot('2024-01-24T09:00:00Z', COLOSSEUM, '2024-01-24'),
      shot('2024-01-22T09:00:00Z', COLOSSEUM, '2024-01-22'),
      shot('2024-01-22T18:00:00Z', TREVI, '2024-01-22'),
    ],
    { id: 't1', start_date: '2024-01-22' }
  )
  assert.deepEqual(days.map((d) => d.date), ['2024-01-22', '2024-01-24'])
  assert.deepEqual(days.map((d) => d.day_number), [1, 3])
  assert.equal(days[0].photos.length, 2)
})

test('the day is filed where the phone filed it, not recomputed from UTC', () => {
  // A photograph taken at 1am in Tokyo is a UTC instant on the previous
  // day. taken_on came off the camera in local time and is believed.
  const days = daysFrom([shot('2024-01-22T16:00:00Z', COLOSSEUM, '2024-01-23')], { start_date: '2024-01-23' })
  assert.equal(days[0].date, '2024-01-23')
})

test('a trip with no dated photographs has no days', () => {
  assert.deepEqual(daysFrom([{ id: 1, lat: 41.9 }], {}), [])
  assert.deepEqual(daysFrom([], {}), [])
})

test('the sentence states what the camera recorded and nothing more', () => {
  const day = daysFrom(
    [
      shot('2024-01-23T10:00:00Z', COLOSSEUM),
      shot('2024-01-23T10:40:00Z', COLOSSEUM),
      shot('2024-01-23T14:00:00Z', TREVI),
      shot('2024-01-23T15:30:00Z', TREVI),
    ],
    { start_date: '2024-01-23' }
  )[0]
  const said = describeDay(day)
  assert.match(said, /4 photographs/)
  assert.match(said, /2 places/)
  assert.match(said, /longest/)
  // No claims about the holiday itself.
  assert.doesNotMatch(said, /lovely|beautiful|enjoyed|relaxing/i)
})

test('and it says when photographs could not say where they were', () => {
  const day = daysFrom(
    [shot('2024-01-23T10:00:00Z', COLOSSEUM), shot('2024-01-23T10:30:00Z', null)],
    { start_date: '2024-01-23' }
  )[0]
  assert.match(describeDay(day), /1 photograph carries no location/)
})

test('a named place is used when one is known', () => {
  const day = daysFrom(
    [shot('2024-01-23T10:00:00Z', COLOSSEUM), shot('2024-01-23T11:00:00Z', COLOSSEUM)],
    { start_date: '2024-01-23' }
  )[0]
  const key = `${day.stops[0].lat.toFixed(4)},${day.stops[0].lon.toFixed(4)}`
  assert.match(describeDay(day, { named: { [key]: 'the Colosseum' } }), /the Colosseum/)
})

test('a day with nothing in it says nothing', () => {
  assert.equal(describeDay(null), '')
  assert.equal(describeDay({ photos: [] }), '')
})

test('every draft says out loud that it was reconstructed', () => {
  // David's own stance, from the New Orleans trip: built from data rather
  // than from a log, and it must never read as though it remembers.
  const day = daysFrom([shot('2024-01-23T10:00:00Z')], { id: 't1', start_date: '2024-01-23' })[0]
  const entry = draftEntry(day, { id: 't1' })
  assert.ok(entry.note.includes(RECONSTRUCTED))
  assert.deepEqual(entry.tags, ['reconstructed'])
  assert.equal(entry.trip_id, 't1')
  assert.equal(entry.entry_date, '2024-01-23')
  assert.equal(entry.day_number, 1)
  // journal_entries.title is NOT NULL.
  assert.ok(entry.title.length > 0)
})
