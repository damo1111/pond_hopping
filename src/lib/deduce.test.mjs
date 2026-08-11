import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  askFor,
  crossingsIn,
  fixesFrom,
  instantOf,
  legsFor,
  modesFor,
  narrow,
  samePart,
  stayFixes,
} from './deduce.js'
import { partAt, nodesNear, zoneAt } from './legs.js'

// Both fixtures below are real traces out of the database, copied unchanged.
// Made-up coordinates would have let every one of these tests pass while the
// feature stayed broken: the two cases that actually decide whether the
// abstraction is right — an aeroplane already airborne on the first fix, and
// a railway station a mile and a half from the airport it shares a name with
// — are things nobody would think to invent.

// ── Rome, 22 January 2024 ──────────────────────────────────────────────
// Two flights in a day. Recorded: BA1433 EDI–LHR, then BA546 LHR–FCO,
// arriving Terminal 5 and leaving from Terminal 5.
const shot = (at, lat = null, lon = null) => ({ taken_at: at, lat, lon })
const ROME_DAY = [
  shot('2024-01-22T13:37:19Z', 55.7845, -3.77281), // already airborne over Lanarkshire
  shot('2024-01-22T13:40:31Z', 55.58193, -3.86059),
  shot('2024-01-22T14:47:23Z', 51.47059, -0.48667), // Heathrow, Terminal 5
  shot('2024-01-22T14:48:08Z', 51.47054, -0.48665),
  shot('2024-01-22T14:52:26Z', 51.47062, -0.48693),
  shot('2024-01-22T15:02:40Z', 51.47101, -0.48736),
  shot('2024-01-22T15:47:57Z', 51.47224, -0.4811),
  shot('2024-01-22T15:55:50Z', 51.47375, -0.48048), // the T5 satellite
  shot('2024-01-22T17:04:46Z'), // in the air: a time, no fix
  shot('2024-01-22T17:17:44Z'),
  shot('2024-01-22T19:46:39Z', 41.89843, 12.49713), // the middle of Rome
  shot('2024-01-22T20:45:26Z', 41.89916, 12.49706),
]

// ── Shanghai to Beijing, 28 May 2026 ───────────────────────────────────
// A Google Timeline day with no flight recorded against it, because there
// wasn't one. 1,063 km in four hours fifty-five.
const CHINA_DAY = [
  {
    track_date: '2026-05-28',
    visits: [
      { t: '05:13', e: '05:38', lat: 31.22726, lon: 121.44363, min: 25 }, // the hotel
      { t: '05:53', e: '06:16', lat: 31.19508, lon: 121.31622, min: 23 },
      { t: '06:38', e: '08:00', lat: 31.19469, lon: 121.31544, min: 82 }, // Hongqiao
      { t: '12:55', e: '14:55', lat: 39.9042, lon: 116.44588, min: 120 }, // Beijing
      { t: '17:15', e: '→06:12', lat: 39.9042, lon: 116.44588, min: 777 },
    ],
  },
]

test('a photograph with a time and no fix bounds nothing, so it is left out', () => {
  const fixes = fixesFrom({ photos: ROME_DAY })
  assert.equal(fixes.length, 10)
  assert.ok(fixes.every((f) => Number.isFinite(f.lat)))
})

test('a stay contributes both its ends, and the arrow means the next morning', () => {
  const fixes = stayFixes(CHINA_DAY, 'Asia/Shanghai')
  assert.equal(fixes.length, 10)
  // 08:00 in Shanghai is 00:00 UTC.
  assert.ok(fixes.some((f) => f.at === '2026-05-28T00:00:00.000Z' && f.how === 'left'))
  assert.equal(instantOf('2026-05-28', '→06:12', 'Asia/Shanghai'), '2026-05-28T22:12:00.000Z')
})

test('one flight photographed twice out of the window is one crossing, not three', () => {
  const crossings = crossingsIn(fixesFrom({ photos: ROME_DAY }))
  assert.equal(crossings.length, 2)
  // The first swallows the two Scottish fixes rather than splitting on them.
  assert.equal(crossings[0].from.at, '2024-01-22T13:37:19.000Z')
  assert.equal(crossings[0].to.at, '2024-01-22T14:47:23.000Z')
  assert.ok(crossings[0].km > 500 && crossings[0].km < 560, `${crossings[0].km} km`)
})

test('a taxi across a city is not a leg', () => {
  // Heathrow to the middle of London: fast, but short.
  const nipped = fixesFrom({
    photos: [shot('2024-01-22T09:00:00Z', 51.47, -0.4543), shot('2024-01-22T09:25:00Z', 51.5074, -0.1278)],
  })
  assert.equal(crossingsIn(nipped).length, 0)
})

test('the average speed rules modes out and never rules one in', () => {
  assert.deepEqual(modesFor(377), ['air']) // no train does this
  assert.deepEqual(modesFor(216), ['air', 'rail']) // both are possible
  assert.deepEqual(modesFor(80), ['air', 'rail', 'road']) // door to door, a short hop
})

test('Heathrow Terminal 5 is named; Terminal 2 against Terminal 3 is not guessed', () => {
  const lhr = nodesNear([51.47059, -0.48667], { kind: 'airport' })[0]
  assert.equal(lhr.code, 'LHR')
  assert.equal(partAt(lhr, [51.47059, -0.48667]).name, 'Terminal 5')
  // Halfway between T2 and T3, six hundred metres apart: no answer beats a
  // coin toss dressed up as a fact.
  assert.equal(partAt(lhr, [51.4705, -0.4541]), null)
})

test('Rome: the flight into Heathrow lands at Terminal 5, and its origin is missing', () => {
  const [first] = legsFor({ photos: ROME_DAY })
  assert.equal(first.began_moving, true)
  const air = first.legs[0]
  assert.equal(air.mode, 'air')
  assert.equal(air.to.node.code, 'LHR')
  assert.equal(air.to.part.name, 'Terminal 5') // recorded terminal_arr for BA1433 is "5"
  // The trace opens at four hundred and fifty kilometres an hour, so where
  // it started is simply not in the evidence.
  assert.equal(air.from.node, null)
  assert.equal(air.certainty, 'possible')
  assert.ok(air.why[0].includes('already moving'))
  // Edinburgh is nonetheless the nearest airport to where the trace begins,
  // which is worth offering and not worth asserting.
  assert.equal(air.from.near[0].code, 'EDI')
})

test('Rome: the flight out is air alone, and which Roman airport is left open', () => {
  const [, second] = legsFor({ photos: ROME_DAY })
  assert.equal(second.legs.length, 1)
  const air = second.legs[0]
  assert.equal(air.mode, 'air')
  assert.equal(air.from.node.code, 'LHR')
  assert.equal(air.from.part.name, 'Terminal 5') // recorded terminal_dep for BA546 is "5"
  // Ciampino is nearer to the middle of Rome than Fiumicino is, and the
  // flight actually taken went to Fiumicino. Geography cannot choose between
  // them, does not pretend to, and offers both — nearest first, which here
  // is the wrong one. Only a timetable settles it.
  assert.equal(air.to.node, null)
  assert.deepEqual(air.to.near.map((n) => n.code), ['CIA', 'FCO'])
  assert.equal(air.certainty, 'likely')
})

test('Shanghai to Beijing is a train, decided by which Hongqiao they stood in', () => {
  const [only] = legsFor(stayFixes(CHINA_DAY, 'Asia/Shanghai'))
  assert.ok(only, 'a 1,063 km crossing should be found')
  const [best, next] = only.legs
  assert.equal(best.mode, 'rail')
  assert.equal(best.from.node.code, 'SHA_HQI')
  assert.equal(best.from.node.name, 'Shanghai Hongqiao Railway Station')
  // The airport of the same name is two kilometres away and would have been
  // a perfectly plausible wrong answer.
  assert.equal(next.mode, 'air')
  assert.ok(best.score > next.score, `rail ${best.score} vs air ${next.score}`)
  // Nobody was recorded at a Beijing station — the arrival fix is four
  // kilometres from the nearest, which is a hotel — so none is named.
  assert.equal(best.to.node, null)
  assert.equal(best.certainty, 'likely')
  assert.ok(best.to.near.some((n) => n.name === 'Beijing South'))
})

test('the question asked of a timetable is a window, weak at one end', () => {
  const [, second] = legsFor({ photos: ROME_DAY })
  const ask = askFor(second.legs[0], second.crossing)
  assert.equal(ask.mode, 'air')
  assert.deepEqual(ask.from, ['LHR'])
  assert.equal(ask.from_part, 'Terminal 5')
  assert.equal(ask.left_after, '2024-01-22T15:55:50.000Z')
  // The first Roman photograph is 19:46; Fiumicino is a good half hour and
  // twenty-four kilometres away, so the aeroplane was down well before it.
  assert.ok(ask.landed_by < '2024-01-22T19:20:00.000Z', ask.landed_by)
})

test('two hoppers an hour apart: the one that landed last wins', () => {
  // Heathrow to Edinburgh. Last seen airside at 12:40 — three hours early,
  // because of the lounge — and photographed in Edinburgh at 18:10.
  const ask = {
    mode: 'air',
    from: ['LHR'],
    to: ['EDI'],
    from_part: 'Terminal 5',
    left_after: '2024-06-01T12:40:00.000Z',
    left_how: 'photograph',
    landed_by: '2024-06-01T17:25:00.000Z',
    landed_after: '2024-06-01T15:25:00.000Z',
  }
  const services = [
    { number: 'BA1444', from: 'LHR', to: 'EDI', dep: '2024-06-01T12:10:00Z', arr: '2024-06-01T13:35:00Z', terminal_from: '5' },
    { number: 'BA1446', from: 'LHR', to: 'EDI', dep: '2024-06-01T13:20:00Z', arr: '2024-06-01T14:45:00Z', terminal_from: '5' },
    { number: 'BA1448', from: 'LHR', to: 'EDI', dep: '2024-06-01T15:45:00Z', arr: '2024-06-01T17:10:00Z', terminal_from: '5' },
    { number: 'BA1450', from: 'LHR', to: 'EDI', dep: '2024-06-01T17:00:00Z', arr: '2024-06-01T18:25:00Z', terminal_from: '5' },
    { number: 'U22987', from: 'LGW', to: 'EDI', dep: '2024-06-01T15:50:00Z', arr: '2024-06-01T17:15:00Z', terminal_from: 'N' },
  ]
  const { one, ranked, rejected } = narrow(services, ask)
  assert.equal(one.number, 'BA1448')
  // The 12:10 had gone before they were last seen; the 17:00 lands after
  // they were already in Edinburgh; the easyJet leaves the wrong airport.
  assert.equal(ranked.length, 2)
  assert.ok(rejected.some((r) => r.service.number === 'BA1444' && r.why.includes('photographed')))
  assert.ok(rejected.some((r) => r.service.number === 'BA1450' && r.why.includes('lands well after')))
  assert.ok(rejected.some((r) => r.service.number === 'U22987'))
})

test('being early at the airport is never used to choose, only to reject', () => {
  // The same two candidates, but nothing separates their arrivals. Being in
  // the lounge since dawn says nothing about which one was boarded, so
  // nothing is claimed.
  const ask = {
    mode: 'air', from: ['LHR'], to: ['EDI'], from_part: null,
    left_after: '2024-06-01T09:00:00.000Z',
    landed_by: '2024-06-01T18:00:00.000Z',
    landed_after: '2024-06-01T16:00:00.000Z',
  }
  const services = [
    { number: 'BA1448', from: 'LHR', to: 'EDI', dep: '2024-06-01T16:00:00Z', arr: '2024-06-01T17:25:00Z' },
    { number: 'BA1450', from: 'LHR', to: 'EDI', dep: '2024-06-01T16:30:00Z', arr: '2024-06-01T17:55:00Z' },
  ]
  const { one, ranked } = narrow(services, ask)
  assert.equal(one, null)
  assert.equal(ranked.length, 2)
})

test('a terminal in the trace throws out everything that leaves from another', () => {
  const ask = {
    mode: 'air', from: ['LHR'], to: ['EDI'], from_part: 'Terminal 5',
    left_after: '2024-06-01T09:00:00.000Z',
    landed_by: '2024-06-01T18:00:00.000Z',
    landed_after: '2024-06-01T16:00:00.000Z',
  }
  const { ranked } = narrow(
    [
      { number: 'BA1448', from: 'LHR', to: 'EDI', dep: '2024-06-01T16:00:00Z', arr: '2024-06-01T17:25:00Z', terminal_from: '5' },
      { number: 'LH905', from: 'LHR', to: 'EDI', dep: '2024-06-01T16:05:00Z', arr: '2024-06-01T17:30:00Z', terminal_from: '2' },
    ],
    ask
  )
  assert.deepEqual(ranked.map((r) => r.number), ['BA1448'])
  assert.ok(samePart('Terminal 5', '5') && samePart('T5', '5') && !samePart('5', '3'))
})

// ── What the sweep over the real archive taught it ─────────────────────
//
// Everything below came from running this over China & Japan and the NZ
// status runs and looking at what it got wrong, rather than from imagining
// what might go wrong. The two calibration bugs it found were both of the
// same kind: a bound that was correct in principle and threw away real
// flights in practice.

test('a speed nothing flies means the trace is wrong, not that the journey was fast', () => {
  // Guangzhou to Shanghai, 24 May 2026, verbatim. Google has them still at
  // Baiyun four hours after the aeroplane they were waiting for landed, so
  // 1,189 km appear to have been covered in fifty-one minutes.
  const [bad] = legsFor(
    stayFixes([
      {
        track_date: '2026-05-24',
        visits: [
          { t: '11:43', e: '18:04', lat: 23.39591, lon: 113.30797 },
          { t: '18:55', e: '→05:38', lat: 31.25593, lon: 121.48711 },
        ],
      },
    ])
  )
  assert.equal(bad.trace_contradicts_itself, true)
  assert.ok(bad.crossing.kmh > 1200, `${bad.crossing.kmh} km/h`)
  // The route is still right — Baiyun to Hongqiao — and it still says so.
  // What it will not do is call it likely.
  assert.equal(bad.legs[0].from.node.code, 'CAN')
  assert.equal(bad.legs[0].certainty, 'unknown')
  assert.ok(bad.legs[0].why[0].includes('one of these two times is wrong'))
})

test('an airport visit outlasts the aeroplane, because the phone is on it', () => {
  // Wellington, 17 June 2026. The recorded stay at the airport ends at
  // 16:05 local; QF282 pushed back at 15:40. Rejecting on the tight bound
  // threw the right flight away for being real.
  const ask = {
    mode: 'air', from: ['WLG'], to: ['BNE'], from_part: null,
    left_after: '2026-06-17T04:05:00.000Z',
    landed_by: '2026-06-17T08:00:00.000Z',
    landed_after: '2026-06-17T06:00:00.000Z',
  }
  const qf282 = { number: 'QF282', from: 'WLG', to: 'BNE', dep: '2026-06-17T03:40:00Z', arr: '2026-06-17T07:55:00Z' }
  assert.equal(narrow([qf282], ask).one?.number, 'QF282')
  // Grace, not surrender: three hours early is still somebody else's flight.
  const earlier = { ...qf282, number: 'QF280', dep: '2026-06-17T01:00:00Z', arr: '2026-06-17T05:15:00Z' }
  assert.deepEqual(narrow([earlier], ask).ranked, [])
})

test('a hundred kilometres at fifty an hour could be a car, and is not claimed', () => {
  // Hong Kong airport to Guangzhou, 22 May 2026 — a real CX982 that this
  // cannot see and should not pretend to. Two hours for a hundred and seven
  // kilometres is a coach, a ferry or a flight, and position cannot tell.
  const quiet = stayFixes([
    {
      track_date: '2026-05-22',
      visits: [
        { t: '06:34', e: '08:01', lat: 22.31347, lon: 113.91373 },
        { t: '10:05', e: '11:59', lat: 23.14091, lon: 113.30986 },
      ],
    },
  ])
  assert.deepEqual(legsFor(quiet), [])
})

test('each stay is dated by the clocks where it happened, not the trip', () => {
  // Seoul is +9 and its longitude says +8; Kuala Lumpur is +8 and its
  // longitude says +7. The airport half an hour away knows better than the
  // arithmetic does, and knows about daylight saving as well.
  assert.equal(zoneAt([37.53192, 126.96244]), 'Asia/Seoul')
  assert.equal(zoneAt([3.14552, 101.66249]), 'Asia/Kuala_Lumpur')
  assert.equal(zoneAt([-37.85057, 144.98567]), 'Australia/Melbourne')
  // Nowhere near an airport: longitude, and honest about being rough.
  assert.equal(zoneAt([21.5, 45.0]), 3)

  // Beijing to Tokyo in one day. One trip-level zone cannot hold both, and
  // using one would move the flight an hour in the wrong direction.
  const [leg] = legsFor(
    stayFixes([
      {
        track_date: '2026-05-31',
        visits: [
          { t: '04:32', e: '08:18', lat: 40.07986, lon: 116.60311 }, // +8
          { t: '12:21', e: '12:58', lat: 35.5483, lon: 139.778 }, // +9
        ],
      },
    ])
  )
  assert.equal(leg.legs[0].from.node.code, 'PEK')
  assert.equal(leg.legs[0].to.node.code, 'HND')
  // 00:18Z to 03:21Z — the recorded NH964 is 00:20Z to 03:55Z.
  assert.equal(leg.crossing.from.at, '2026-05-31T00:18:00.000Z')
  assert.ok(leg.crossing.kmh > 600 && leg.crossing.kmh < 800, `${leg.crossing.kmh} km/h`)
})
