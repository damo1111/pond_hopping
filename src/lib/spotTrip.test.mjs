import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AWAY_KM, apart, spanDays, spotTrip } from './spotTrip.js'

const LONDON = { lat: 51.5, lng: -0.13, known: true }
const BANFF = { lat: 51.18, lon: -115.57 }
const BRIGHTON = { lat: 50.82, lon: -0.14 }
const PARIS = { lat: 48.86, lon: 2.35 }

const run = (start, end, centre) => ({ start, end, centre, count: 30 })

test('distances are real great circles, not straight lines on a map', () => {
  // London to Banff crosses a lot of curvature; a flat approximation is out
  // by hundreds of kilometres and this is what the threshold is measured on.
  assert.ok(Math.abs(apart({ lat: 51.5, lon: -0.13 }, BANFF) - 7000) < 400)
  assert.ok(apart({ lat: 51.5, lon: -0.13 }, BRIGHTON) < 90)
})

test('a day out is not a trip, two days is', () => {
  assert.equal(spanDays(run('2026-08-20', '2026-08-20')), 1)
  assert.equal(spanDays(run('2026-08-20', '2026-08-21')), 2)
  assert.equal(spanDays(run('2026-08-17', '2026-08-22')), 6)
})

test('five days of photographs in Canada is offered', () => {
  // The case this exists for: David's friends, no itinerary, no booking, no
  // flight — nothing saying "trip" except the photographs.
  const got = spotTrip({ clusters: [run('2026-08-17', '2026-08-21', BANFF)], home: LONDON })
  assert.ok(got, 'should offer')
  assert.equal(got.days, 5)
  assert.ok(got.km > 6000)
})

test('but a weekend down the road is not', () => {
  // Two days of photographs is a trip only if it happened somewhere else.
  // Brighton is 80km from London and is somebody having a Saturday.
  assert.equal(spotTrip({ clusters: [run('2026-08-20', '2026-08-21', BRIGHTON)], home: LONDON }), null)
})

test('and neither is one day, however far away', () => {
  assert.equal(spotTrip({ clusters: [run('2026-08-20', '2026-08-20', BANFF)], home: LONDON }), null)
})

test('somewhere else in your own country still counts', () => {
  // Not "abroad", deliberately. An app called Pond Hopping that only noticed
  // international travel would be wrong about most of what people do.
  const MELBOURNE = { lat: -37.8, lng: 145.0, known: true }
  const SYDNEY = { lat: -33.9, lon: 151.2 }
  const got = spotTrip({ clusters: [run('2026-08-20', '2026-08-22', SYDNEY)], home: MELBOURNE })
  assert.ok(got, 'three days in Sydney is a trip')
  assert.ok(got.km > AWAY_KM)
})

test('nothing is offered when we do not know where home is', () => {
  // Prove the check can fail: without it, every uncertainty resolves to a
  // guess, and one wrong offer teaches somebody the app guesses badly.
  const clusters = [run('2026-08-17', '2026-08-21', BANFF)]
  assert.equal(spotTrip({ clusters, home: { lat: 51.5, lng: -0.13, known: false } }), null)
  assert.equal(spotTrip({ clusters, home: null }), null)
  assert.equal(spotTrip({ clusters, home: { known: true } }), null)
})

test('nor when the photographs have no location at all', () => {
  // No idea where: no idea whether it was a trip.
  assert.equal(spotTrip({ clusters: [run('2026-08-17', '2026-08-21', null)], home: LONDON }), null)
})

test('a trip already imported is never offered again', () => {
  // The one that would be actively annoying — being asked, saying yes, and
  // being asked the same thing on the next upload.
  const clusters = [run('2026-08-17', '2026-08-21', BANFF)]
  assert.ok(spotTrip({ clusters, home: LONDON }))
  assert.equal(
    spotTrip({ clusters, home: LONDON, already: [{ start_date: '2026-08-17' }] }),
    null
  )
})

test('the most recent qualifying run wins, not the biggest', () => {
  // The offer is about what somebody is doing now. A fortnight in Peru two
  // years ago is a fine thing to import and a strange thing to be asked
  // about on the way out of an airport.
  const got = spotTrip({
    clusters: [
      run('2024-03-01', '2024-03-20', { lat: -13.5, lon: -71.9 }), // longer, older
      run('2026-08-19', '2026-08-21', PARIS), // shorter, now
    ],
    home: LONDON,
  })
  assert.equal(got.start, '2026-08-19')
})

test('nothing in, nothing out', () => {
  assert.equal(spotTrip({ clusters: [], home: LONDON }), null)
  assert.equal(spotTrip({}), null)
  assert.equal(spotTrip(), null)
})
