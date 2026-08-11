import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enrichment, worthAsking } from './flightEnrich.js'

// The real gaps on one trip: CX982 and FM9312 have no registration, NH964
// has no cabin, and none of the five has an actual departure time.

test('an empty field is filled', () => {
  const { patch } = enrichment(
    { flight_number: 'CX982', registration: null, cabin: 'Business' },
    { registration: 'B-LQE' },
    'byair'
  )
  assert.equal(patch.registration, 'B-LQE')
  assert.equal(patch.enriched_from, 'byair')
  assert.ok(patch.enriched_at)
})

test('a field somebody recorded is never replaced', () => {
  // You were on the aeroplane. The API was not.
  const { patch, disagreed } = enrichment(
    { cabin: 'Business', seat: '1K' },
    { cabin: 'Economy', seat: '32A' },
    'byair'
  )
  assert.equal(patch.cabin, undefined)
  assert.equal(patch.seat, undefined)
  assert.deepEqual(
    disagreed.map((d) => d.field).sort(),
    ['cabin', 'seat']
  )
})

test('and the disagreement is kept rather than settled', () => {
  // A seat in a cabin the aircraft does not have is usually an equipment
  // swap, which is worth telling somebody about.
  const { patch } = enrichment({ cabin: 'Business' }, { cabin: 'Economy' }, 'byair')
  assert.deepEqual(patch.disagreed, [{ field: 'cabin', ours: 'Business', theirs: 'Economy' }])
})

test('gates and actual times are always theirs — nobody types those', () => {
  const { patch, disagreed } = enrichment(
    { gate_dep: '15', actual_dep_time: '2026-05-21T14:05:00Z' },
    { gate_dep: '22', actual_dep_time: '2026-05-21T14:47:00Z' },
    'aeroapi'
  )
  assert.equal(patch.gate_dep, '22')
  assert.equal(patch.actual_dep_time, '2026-05-21T14:47:00Z')
  assert.deepEqual(disagreed, [])
})

test('the same value said differently is not a disagreement', () => {
  const { disagreed } = enrichment(
    { registration: 'b-lrg', airline: 'Cathay Pacific' },
    { registration: 'B-LRG', airline: 'cathay pacific' },
    'byair'
  )
  assert.deepEqual(disagreed, [])
})

test('two sources measuring a distance are allowed to differ a little', () => {
  assert.deepEqual(enrichment({ distance_km: 6947 }, { distance_km: 6960 }, 'byair').disagreed, [])
  assert.equal(enrichment({ distance_km: 6947 }, { distance_km: 2100 }, 'byair').disagreed.length, 1)
})

test('nothing to add and nothing to argue about writes nothing at all', () => {
  const { patch } = enrichment({ registration: 'B-LRG' }, { registration: 'B-LRG' }, 'byair')
  assert.deepEqual(patch, {})
})

test('a source that knows nothing does not stamp the flight as enriched', () => {
  // Otherwise a source being down would mark every flight as done for ever.
  assert.deepEqual(enrichment({ registration: null }, {}, 'byair').patch, {})
})

test('asked once, ever', () => {
  const now = new Date('2026-08-11T00:00:00Z')
  const flights = [
    { flight_number: 'CX156', dep_time: '2026-05-21T14:05:00Z' },
    { flight_number: 'CX982', dep_time: '2026-05-21T23:50:00Z', enriched_at: '2026-08-01T00:00:00Z' },
    { flight_number: null, dep_time: '2026-05-24T05:30:00Z' },
    { flight_number: 'QF26', dep_time: null },
    // Not flown yet: asking gets a schedule, not a record.
    { flight_number: 'BA15', dep_time: '2026-09-01T10:00:00Z' },
  ]
  assert.deepEqual(worthAsking(flights, { now }).map((f) => f.flight_number), ['CX156'])
})
