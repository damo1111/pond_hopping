import { test } from 'node:test'
import assert from 'node:assert/strict'
import { instant, mapAnswer, pickLeg } from '../../api/enrich-flight.js'

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
    actual_dep_time: '2026-05-22T00:11:00Z',
    actual_arr_time: '2026-05-22T01:02:00Z',
    aircraft_model: 'Airbus A330',
    gate_dep: '23',
    terminal_dep: '1',
    terminal_arr: '2',
    distance_km: 136,
  })
})

test('wheels-up beats a revised estimate', () => {
  const estimated = { departure: { revisedTime: { utc: '2026-05-22 00:04Z' } } }
  assert.equal(mapAnswer(estimated).actual_dep_time, '2026-05-22T00:04:00Z')
  assert.equal(mapAnswer(ANSWER).actual_dep_time, '2026-05-22T00:11:00Z')
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

// ── Checked against a real answer ─────────────────────────────────────────
//
// CX139, Hong Kong to Sydney, 7 July 2026, exactly as AeroDataBox returned
// it. The mapping above was written from documentation; this is the thing
// itself, and it is what the mapping is now held to.

const REAL = {
  greatCircleDistance: { meter: 7371771.91, km: 7371.77, mile: 4580.61 },
  departure: {
    airport: { icao: 'VHHH', iata: 'HKG', name: 'Hong Kong Chek Lap Kok' },
    scheduledTime: { utc: '2026-07-07 01:10Z', local: '2026-07-07 09:10+08:00' },
    revisedTime: { utc: '2026-07-07 01:10Z' },
    runwayTime: { utc: '2026-07-07 03:07Z' },
    terminal: '1',
    checkInDesk: 'B,B',
    gate: '4',
    quality: ['Basic', 'Live'],
  },
  arrival: {
    airport: { icao: 'YSSY', iata: 'SYD' },
    scheduledTime: { utc: '2026-07-07 10:10Z' },
    revisedTime: { utc: '2026-07-07 11:22Z' },
    runwayTime: { utc: '2026-07-07 11:08Z' },
    terminal: '1',
    runway: '16R',
  },
  number: 'CX 139',
  callSign: 'CPA139',
  status: 'Arrived',
  aircraft: { reg: 'B-KPU', modeS: '780A16', model: 'Boeing 777-300' },
  airline: { name: 'Cathay Pacific', iata: 'CX', icao: 'CPA' },
}

test('the real answer, mapped', () => {
  assert.deepEqual(mapAnswer(REAL), {
    registration: 'B-KPU',
    airline: 'Cathay Pacific',
    actual_dep_time: '2026-07-07T03:07:00Z',
    actual_arr_time: '2026-07-07T11:08:00Z',
    aircraft_model: 'Boeing 777-300',
    call_sign: 'CPA139',
    gate_dep: '4',
    terminal_dep: '1',
    terminal_arr: '1',
    distance_km: 7371.77,
  })
})

test('and it keeps the two hours that make it worth asking', () => {
  // Scheduled 01:10, revised 01:10, off the runway at 03:07. A story cannot
  // say "we sat on the stand for two hours" from anything else in this app.
  const out = mapAnswer(REAL)
  const late = (Date.parse(out.actual_dep_time) - Date.parse('2026-07-07T01:10:00Z')) / 60000
  assert.equal(late, 117)
})

test('a space where the T belongs is not left for Postgres to guess at', () => {
  assert.equal(instant('2026-07-07 03:07Z'), '2026-07-07T03:07:00Z')
  assert.equal(instant('2026-07-07 03:07:44Z'), '2026-07-07T03:07:44Z')
  assert.equal(instant('2026-07-07T03:07:00Z'), '2026-07-07T03:07:00Z')
  assert.equal(instant(null), null)
})

test('an arrival with no gate does not invent one', () => {
  assert.equal('gate_arr' in mapAnswer(REAL), false)
})
