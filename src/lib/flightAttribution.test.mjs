// node --test src/lib/flightAttribution.test.mjs
//
// The attribution queue decides what a person is asked and, more
// importantly, what they are *not* asked, so it's worth pinning down. The
// cases below are the ones that came out of a real 899-flight import.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  claimedBy,
  claimedKm,
  commuteCandidates,
  findConflicts,
  nextQuestion,
  openConflicts,
  samePattern,
  unresolvableConflicts,
} from './flightAttribution.js'

const ME = 'me@example.com'
const THEM = 'them@example.com'

let n = 0
const flight = (dep, arr, from, to, extra = {}) => ({
  id: `f${++n}`,
  flight_number: 'XX100',
  dep_airport: dep,
  arr_airport: arr,
  dep_time: from,
  arr_time: to,
  status: 'flown',
  travellers: null,
  travellers_confirmed_at: null,
  distance_km: 100,
  ...extra,
})

test('an unclaimed flight is assumed to be the account owner’s', () => {
  const f = [flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T17:00:00Z')]
  assert.equal(claimedBy(f, ME).length, 1)
  assert.equal(claimedKm(f, ME), 100)
})

test('a flight confirmed as nobody’s is not the owner’s', () => {
  const f = [
    flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T17:00:00Z', {
      travellers: [],
      travellers_confirmed_at: '2024-02-01T00:00:00Z',
    }),
  ]
  assert.equal(claimedBy(f, ME).length, 0)
  assert.equal(nextQuestion(f, ME), null)
})

test('cancelled flights are nobody’s problem', () => {
  const f = [
    flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T17:00:00Z', { status: 'cancelled' }),
    flight('LHR', 'CDG', '2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z'),
  ]
  assert.equal(findConflicts(f, ME).length, 0)
})

test('two aeroplanes at once is a conflict', () => {
  const f = [
    flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T17:00:00Z'),
    flight('MEL', 'SIN', '2024-01-01T10:00:00Z', '2024-01-01T18:00:00Z'),
  ]
  const c = findConflicts(f, ME)
  assert.equal(c.length, 1)
  assert.equal(c[0].kind, 'overlap')
})

test('departing where you did not land is a conflict only when there was no time', () => {
  const tight = [
    flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T17:00:00Z'),
    flight('CDG', 'FCO', '2024-01-01T17:20:00Z', '2024-01-01T19:00:00Z'),
  ]
  assert.equal(findConflicts(tight, ME).filter((c) => c.kind === 'teleport').length, 1)

  // Same break, a week later: that's a ferry, a train or a missing row, not
  // an impossibility, and asking about it would be noise.
  const loose = [
    flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T17:00:00Z'),
    flight('CDG', 'FCO', '2024-01-08T10:00:00Z', '2024-01-08T12:00:00Z'),
  ]
  const kinds = findConflicts(loose, ME).map((c) => c.kind)
  assert.deepEqual(kinds, ['gap'])
  assert.equal(nextQuestion(loose, ME), null, 'a soft gap is never asked about')
})

test('the question asked is the flight settling the most contradictions', () => {
  // One flight overlapping two others: answering it clears both.
  const busy = flight('SYD', 'LAX', '2024-01-01T08:00:00Z', '2024-01-01T20:00:00Z')
  const f = [
    busy,
    flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T12:00:00Z'),
    flight('CDG', 'FCO', '2024-01-01T13:00:00Z', '2024-01-01T15:00:00Z'),
  ]
  assert.equal(nextQuestion(f, ME).flight.id, busy.id)
})

test('an answer propagates: resolving one flight can clear its neighbours', () => {
  const intruder = flight('SYD', 'LAX', '2024-01-01T08:00:00Z', '2024-01-01T20:00:00Z')
  const f = [
    intruder,
    flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T12:00:00Z'),
    flight('JFK', 'LHR', '2024-01-01T13:00:00Z', '2024-01-01T19:00:00Z'),
  ]
  assert.ok(findConflicts(f, ME).length >= 2)

  const after = f.map((x) =>
    x.id === intruder.id ? { ...x, travellers: [THEM], travellers_confirmed_at: 'now' } : x
  )
  assert.equal(findConflicts(after, ME).length, 0)
  assert.equal(nextQuestion(after, ME), null)
})

test('answering "that was me" moves on, even though the clash remains', () => {
  // The bug this pins: claiming a flight doesn't resolve the contradiction —
  // you're still on two aeroplanes — so the queue re-picked the same flight
  // forever and the button looked dead. A flight someone has ruled on is
  // settled; the question belongs on the other side of the clash now.
  const a = flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T17:00:00Z')
  const b = flight('MEL', 'SIN', '2024-01-01T10:00:00Z', '2024-01-01T18:00:00Z')
  const first = nextQuestion([a, b], ME).flight

  const answered = [a, b].map((x) =>
    x.id === first.id ? { ...x, travellers: [ME], travellers_confirmed_at: 'now' } : x
  )
  const second = nextQuestion(answered, ME)
  assert.ok(second, 'the other side is still worth asking about')
  assert.notEqual(second.flight.id, first.id, 'must not re-ask the flight just answered')

  // And once both have been claimed there is nothing left to ask, even
  // though the contradiction is still there.
  const both = answered.map((x) => ({ ...x, travellers: [ME], travellers_confirmed_at: 'now' }))
  assert.equal(nextQuestion(both, ME), null)
  assert.equal(unresolvableConflicts(both, ME).length, 1, 'reported, not silently dropped')
})

test('the outstanding count only counts flights still open to a question', () => {
  const a = flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T17:00:00Z')
  const b = flight('MEL', 'SIN', '2024-01-01T10:00:00Z', '2024-01-01T18:00:00Z')
  assert.equal(openConflicts([a, b], ME).length, 1)
  const answered = [{ ...a, travellers: [ME], travellers_confirmed_at: 'now' }, b]
  assert.equal(openConflicts(answered, ME).length, 1, 'still open — b hasn’t been answered')
  const bothAnswered = answered.map((x) => ({ ...x, travellers_confirmed_at: 'now' }))
  assert.equal(openConflicts(bothAnswered, ME).length, 0)
})

test('skipping moves the question to the other side of the clash, not away', () => {
  const a = flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T17:00:00Z')
  const b = flight('MEL', 'SIN', '2024-01-01T10:00:00Z', '2024-01-01T18:00:00Z')
  const f = [a, b]
  const first = nextQuestion(f, ME).flight.id
  const second = nextQuestion(f, ME, new Set([first]))
  assert.ok(second, 'the clash is still open')
  assert.notEqual(second.flight.id, first)
})

test('the clash is reported alongside the question so it can be answered', () => {
  const f = [
    flight('LHR', 'JFK', '2024-01-01T09:00:00Z', '2024-01-01T17:00:00Z'),
    flight('MEL', 'SIN', '2024-01-01T10:00:00Z', '2024-01-01T18:00:00Z'),
  ]
  const q = nextQuestion(f, ME)
  assert.equal(q.against.length, 1)
  assert.notEqual(q.against[0].other.id, q.flight.id)
})

test('the same carrier on the same route is offered as one habit', () => {
  const target = flight('SFO', 'LAS', '2024-01-01T09:00:00Z', '2024-01-01T10:00:00Z', {
    flight_number: 'AS2310',
  })
  const f = [
    target,
    flight('SFO', 'LAS', '2024-03-01T09:00:00Z', '2024-03-01T10:00:00Z', { flight_number: 'AS2306' }),
    flight('SFO', 'LAS', '2024-04-01T09:00:00Z', '2024-04-01T10:00:00Z', { flight_number: 'QX2310' }),
    flight('LAS', 'SFO', '2024-05-01T09:00:00Z', '2024-05-01T10:00:00Z', { flight_number: 'AS2311' }),
    flight('SFO', 'LAS', '2024-06-01T09:00:00Z', '2024-06-01T10:00:00Z', {
      flight_number: 'AS2222',
      travellers_confirmed_at: 'already answered',
    }),
  ]
  const same = samePattern(f, target, ME)
  assert.deepEqual(
    same.map((x) => x.flight_number),
    ['AS2306'],
    'same carrier and direction only, and nothing already answered'
  )
})

test('the queue terminates: answering the top question always shrinks it', () => {
  // A tangle of ten overlapping flights on the same afternoon.
  const f = Array.from({ length: 10 }, (_, i) =>
    flight('A' + i, 'B' + i, `2024-01-01T${String(8 + i).padStart(2, '0')}:00:00Z`, '2024-01-01T23:00:00Z')
  )
  let state = f
  let asked = 0
  while (nextQuestion(state, ME)) {
    const q = nextQuestion(state, ME)
    state = state.map((x) =>
      x.id === q.flight.id ? { ...x, travellers: [THEM], travellers_confirmed_at: 'now' } : x
    )
    if (++asked > f.length) break
  }
  assert.ok(asked <= f.length, `converged in ${asked} questions`)
  assert.equal(findConflicts(state, ME).filter((c) => c.kind !== 'gap').length, 0)
})

test('a commute is never asked about — it is self-evidently yours', () => {
  // 140 identical Edinburgh–London hops generated most of the clashes in a
  // real import, and no one can say which Tuesday was which.
  const a = flight('EDI', 'LHR', '2024-01-01T09:00:00Z', '2024-01-01T10:30:00Z', {
    purpose: 'commute',
  })
  const b = flight('MEL', 'SIN', '2024-01-01T10:00:00Z', '2024-01-01T18:00:00Z', {
    purpose: 'commute',
  })
  assert.equal(nextQuestion([a, b], ME), null)
  assert.equal(openConflicts([a, b], ME).length, 0)
  assert.equal(unresolvableConflicts([a, b], ME).length, 0)

  // Still counted, though — they happened.
  assert.equal(claimedKm([a, b], ME), 200)

  // A commute clashing with a real trip still surfaces the trip, since that
  // is the leg a person can actually rule on.
  const trip = flight('LHR', 'JFK', '2024-01-01T09:30:00Z', '2024-01-01T17:00:00Z')
  const q = nextQuestion([a, trip], ME)
  assert.equal(q.flight.id, trip.id)
})

test('a repeated short hop is offered as a route, a repeated long-haul is not', () => {
  const hop = (i) =>
    flight('EDI', 'LHR', `2024-0${(i % 9) + 1}-01T09:00:00Z`, `2024-0${(i % 9) + 1}-01T10:30:00Z`, {
      distance_km: 534,
    })
  const haul = (i) =>
    flight('LHR', 'JFK', `2024-0${(i % 9) + 1}-15T09:00:00Z`, `2024-0${(i % 9) + 1}-15T17:00:00Z`, {
      distance_km: 5540,
    })
  const f = [...Array(14)].map((_, i) => hop(i)).concat([...Array(14)].map((_, i) => haul(i)))

  const found = commuteCandidates(f)
  assert.equal(found.length, 1, 'the transatlantic route is not a commute however often it is flown')
  assert.equal(found[0].route, 'EDI–LHR')
  assert.equal(found[0].legs, 14)

  // Direction doesn't matter — a commute is a there-and-back habit.
  const back = f.concat([...Array(3)].map(() =>
    flight('LHR', 'EDI', '2024-05-02T18:00:00Z', '2024-05-02T19:30:00Z', { distance_km: 534 })))
  assert.equal(commuteCandidates(back)[0].legs, 17)

  // And once someone has said "these were trips", it stops being asked.
  const answered = f.map((x) => ({ ...x, purpose_confirmed_at: 'now' }))
  assert.deepEqual(commuteCandidates(answered), [])
})
