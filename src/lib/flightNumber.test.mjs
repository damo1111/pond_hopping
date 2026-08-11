import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paths, splitNumber, mapAnswer, pickLeg, beyondReach } from '../../api/enrich-flight-cirium.js'

// Every one of these is a real flight number out of the flights table, which
// is the only list worth testing against. The awkward ones are the carriers
// with a digit in the code — taking the leading letters gets FD3211 wrong as
// carrier "FD" number "3211" only by luck, and 9W and U2 not at all.
test('a flight number splits into a carrier and a number', () => {
  const cases = {
    CX139: ['CX', '139'],
    BA115: ['BA', '115'],
    QR6121: ['QR', '6121'],
    JL52: ['JL', '52'],
    FD3211: ['FD', '3211'],
    NH964: ['NH', '964'],
    FM9312: ['FM', '9312'],
    QF26: ['QF', '26'],
    '9W121': ['9W', '121'],
    U28532: ['U2', '8532'],
    B6104: ['B6', '104'],
  }
  for (const [said, [carrier, number]] of Object.entries(cases)) {
    assert.deepEqual(splitNumber(said), { carrier, number }, said)
  }
})

test('spaces and dashes are how people write them, not part of them', () => {
  assert.deepEqual(splitNumber('BA 115'), { carrier: 'BA', number: '115' })
  assert.deepEqual(splitNumber('ba-115'), { carrier: 'BA', number: '115' })
})

test('a three-letter code is an ICAO designator, not a carrier and a digit', () => {
  assert.deepEqual(splitNumber('BAW115'), { carrier: 'BAW', number: '115' })
})

test('something that is not a flight number says so rather than guessing', () => {
  assert.equal(splitNumber(''), null)
  assert.equal(splitNumber('Eurostar'), null)
  assert.equal(splitNumber('12345'), null)
})

test('the historical path is tried first, because that is where the old ones are', () => {
  const [first, second] = paths({ carrier: 'BA', number: '115', on: '2014-06-07' })
  assert.equal(first.name, 'historical')
  assert.match(first.url, /historical.*\/BA\/115\/dep\/2014\/6\/7$/)
  assert.equal(second.name, 'status')
})

test('the registration and the type are what this source is for', () => {
  const out = mapAnswer(
    {
      carrierFsCode: 'CX',
      flightEquipment: { tailNumber: 'B-KPU', actualEquipmentIataCode: '77W' },
      operationalTimes: { actualGateDeparture: { dateUtc: '2026-07-07T01:14:00.000Z' } },
      airportResources: { departureGate: '23', departureTerminal: '1' },
    },
    { airlines: [{ fs: 'CX', name: 'Cathay Pacific' }], equipments: [{ iata: '77W', name: 'Boeing 777-300ER' }] }
  )
  assert.equal(out.registration, 'B-KPU')
  assert.equal(out.aircraft_model, 'Boeing 777-300ER')
  assert.equal(out.airline, 'Cathay Pacific')
  assert.equal(out.actual_dep_time, '2026-07-07T01:14:00.000Z')
  assert.equal(out.gate_dep, '23')
})

test('a code with no name in the appendix is still better than nothing', () => {
  assert.equal(mapAnswer({ flightEquipment: { scheduledEquipmentIataCode: '359' } }).aircraft_model, '359')
})

test('nothing known means nothing written, not a row of nulls', () => {
  assert.deepEqual(mapAnswer({}), {})
})

test('the leg somebody actually took is the one from their airport', () => {
  const list = [
    { departureAirportFsCode: 'LHR', flightEquipment: { tailNumber: 'G-AAA' } },
    { departureAirportFsCode: 'FCO', flightEquipment: { tailNumber: 'G-BBB' } },
  ]
  assert.equal(pickLeg(list, { dep_airport: 'FCO' })?.flightEquipment.tailNumber, 'G-BBB')
  // No airport recorded is not a reason to refuse an answer.
  assert.equal(pickLeg(list, {})?.flightEquipment.tailNumber, 'G-AAA')
  assert.equal(pickLeg([], { dep_airport: 'FCO' }), null)
})

// The distinction that cost 185 flights with the previous source.
test('a refusal to look is never a record of nothing', () => {
  assert.equal(beyondReach(403, 'not entitled'), true)
  assert.equal(beyondReach(401, ''), true)
  assert.equal(beyondReach(400, 'date is outside the permitted range'), true)
  // The source looked and found nothing. That is an answer and it is final.
  assert.equal(beyondReach(404, 'no flights found'), false)
  assert.equal(beyondReach(200, ''), false)
})
