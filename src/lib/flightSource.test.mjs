import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapAnswer, pickLeg } from '../../api/enrich-flight.js'

// The documented shape. Checked against a real answer with ?peek=1 before
// anything is written to forty flights — see the note in enrich-flight.js.
const ANSWER = {
  airline: { name: 'Cathay Pacific' },
  aircraft: { reg: 'B-LQE', model: 'Airbus A330' },
  greatCircleDistance: { km: 136 },
  departure: {
    airport: { iata: 'HKG' },
    terminal: '1',
    gate: '23',
    revisedTime: { utc: '2026-05-21 23:58Z' },
    runwayTime: { utc: '2026-05-22 00:11Z' },
  },
  arrival: { airport: { iata: 'CAN' }, terminal: '2', runwayTime: { utc: '2026-05-22 01:02Z' } },
}

test('the fields this app keeps, and nothing else', () => {
  assert.deepEqual(mapAnswer(ANSWER), {
    registration: 'B-LQE',
    airline: 'Cathay Pacific',
    actual_dep_time: '2026-05-22 00:11Z',
    actual_arr_time: '2026-05-22 01:02Z',
    gate_dep: '23',
    terminal_dep: '1',
    terminal_arr: '2',
    distance_km: 136,
  })
})

test('wheels-up beats a revised estimate', () => {
  const estimated = { departure: { revisedTime: { utc: 'A' } } }
  assert.equal(mapAnswer(estimated).actual_dep_time, 'A')
  assert.equal(mapAnswer(ANSWER).actual_dep_time, '2026-05-22 00:11Z')
})

test('a source that knows nothing returns nothing, not a row of nulls', () => {
  // enrichment() reads an empty answer as "not enriched", so a bad
  // afternoon for an API must not look like a successful lookup.
  assert.deepEqual(mapAnswer({}), {})
  assert.deepEqual(mapAnswer({ aircraft: {}, departure: { gate: '' } }), {})
})

test('the right leg of a flight number flown twice that day', () => {
  const legs = [
    { departure: { airport: { iata: 'LHR' } } },
    { departure: { airport: { iata: 'HKG' } } },
  ]
  assert.equal(pickLeg(legs, { dep_airport: 'hkg' }).departure.airport.iata, 'HKG')
  // Nothing matching is still better answered than refused.
  assert.equal(pickLeg(legs, { dep_airport: 'SYD' }).departure.airport.iata, 'LHR')
  assert.equal(pickLeg([], { dep_airport: 'HKG' }), null)
})
