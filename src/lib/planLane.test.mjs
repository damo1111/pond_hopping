import test from 'node:test'
import assert from 'node:assert/strict'
import { countdown, daysUntil, emptyDays, isBooked, nightsCovered, nightsOf, planLane, readiness } from './planLane.js'

const TODAY = new Date('2026-08-06T09:00:00')

test('days are counted in whole days, not by the clock', () => {
  assert.equal(daysUntil('2026-08-06', TODAY), 0)
  assert.equal(daysUntil('2026-08-07', TODAY), 1)
  assert.equal(daysUntil('2026-10-09', TODAY), 64)
  assert.equal(daysUntil('2026-08-01', TODAY), -5)
  assert.equal(daysUntil(null, TODAY), null)
  assert.equal(daysUntil('not a date', TODAY), null)
})

test('the countdown says it in words, because that is the point of the screen', () => {
  assert.equal(countdown({ start_date: '2026-10-09' }, TODAY).text, 'In 64 days')
  assert.equal(countdown({ start_date: '2026-08-07' }, TODAY).text, 'Tomorrow')
  assert.equal(countdown({ start_date: '2026-08-06' }, TODAY).text, 'Today')
  assert.equal(countdown({ start_date: '2026-08-09' }, TODAY).text, 'In 3 days')
  assert.equal(countdown({ start_date: '2026-08-15' }, TODAY).text, 'Next week')
  assert.equal(countdown({}, TODAY).text, 'Dates to come')
})

test('a trip you are on says so rather than counting to a date that has passed', () => {
  const c = countdown({ start_date: '2026-08-01', end_date: '2026-08-20' }, TODAY)
  assert.equal(c.text, 'Happening now')
  assert.equal(c.live, true)
})

test('a finished trip does not claim to be upcoming', () => {
  const c = countdown({ start_date: '2026-07-01', end_date: '2026-07-10' }, TODAY)
  assert.equal(c.past, true)
})

test('booked means the things that cost money exist, not a count of ticks', () => {
  // Twenty restaurants and no way of getting there is not a booked trip.
  assert.equal(isBooked(Array.from({ length: 20 }, () => ({ kind: 'activity' }))), false)
  assert.equal(isBooked([{ kind: 'flight' }]), false)
  assert.equal(isBooked([{ kind: 'flight' }, { kind: 'hotel' }]), true)
})

test('readiness counts the three things worth knowing', () => {
  const r = readiness([{ kind: 'flight' }, { kind: 'flight' }, { kind: 'hotel' }, { kind: 'activity' }, { kind: 'place' }])
  assert.deepEqual(r.map((m) => [m.key, m.have]), [['flights', 2], ['beds', 1], ['doing', 2]])
})

test('one lane: booked first, then planning, then someday', () => {
  const lane = planLane({
    trips: [
      { id: 'far', title: 'Far off', start_date: '2027-01-01' },
      { id: 'soon', title: 'Soon', start_date: '2026-09-01' },
    ],
    wishlist: [{ id: 'w1', title: 'Patagonia' }],
    events: [{ trip_id: 'soon', kind: 'flight' }, { trip_id: 'soon', kind: 'hotel' }],
    today: TODAY,
  })
  assert.deepEqual(lane.map((r) => [r.stage, r.title]), [
    ['booked', 'Soon'],
    ['planning', 'Far off'],
    ['someday', 'Patagonia'],
  ])
})

test('within a stage the nearest departure comes first', () => {
  const lane = planLane({
    trips: [
      { id: 'c', title: 'C', start_date: '2027-03-01' },
      { id: 'a', title: 'A', start_date: '2026-09-01' },
      { id: 'b', title: 'B', start_date: '2026-12-01' },
    ],
    today: TODAY,
  })
  assert.deepEqual(lane.map((r) => r.title), ['A', 'B', 'C'])
})

test('a trip with no dates waits behind the ones that have them', () => {
  const lane = planLane({
    trips: [
      { id: 'someday', title: 'No dates' },
      { id: 'dated', title: 'Dated', start_date: '2026-12-01' },
    ],
    today: TODAY,
  })
  assert.deepEqual(lane.map((r) => r.title), ['Dated', 'No dates'])
})

test('a wish already promoted to a trip appears once, as the trip', () => {
  const lane = planLane({
    trips: [{ id: 't1', title: 'Lisbon & Porto', start_date: '2026-10-09' }],
    wishlist: [
      { id: 'w1', title: 'Lisbon', trip_id: 't1' },
      { id: 'w2', title: 'Still just an idea' },
    ],
    today: TODAY,
  })
  assert.deepEqual(lane.map((r) => r.title), ['Lisbon & Porto', 'Still just an idea'])
})

test('a wish pointing at a trip that is gone is still an idea, not dropped', () => {
  const lane = planLane({ trips: [], wishlist: [{ id: 'w1', title: 'Orphan', trip_id: 'deleted' }], today: TODAY })
  assert.deepEqual(lane.map((r) => r.title), ['Orphan'])
})

test('nothing at all is an empty lane rather than a crash', () => {
  assert.deepEqual(planLane(), [])
  assert.deepEqual(planLane({ trips: [], wishlist: [], events: [] }), [])
})

test('each row carries its own events, not everyone else’s', () => {
  const lane = planLane({
    trips: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
    events: [{ trip_id: 'a', kind: 'flight' }, { trip_id: 'b', kind: 'activity' }, { trip_id: 'b', kind: 'activity' }],
    today: TODAY,
  })
  const byTitle = Object.fromEntries(lane.map((r) => [r.title, r]))
  assert.equal(byTitle.A.readiness.find((m) => m.key === 'flights').have, 1)
  assert.equal(byTitle.B.readiness.find((m) => m.key === 'doing').have, 2)
  assert.equal(byTitle.B.readiness.find((m) => m.key === 'flights').have, 0)
})

test('a night is either slept in or it is not', () => {
  // "2 beds" on a seven-night trip could be nearly finished or barely
  // started. Two hotels can also overlap, or leave a hole in the middle,
  // which is the case a count of bookings cannot see and the one worth
  // catching.
  const trip = { start_date: '2026-10-09', end_date: '2026-10-16' }
  assert.equal(nightsOf(trip), 7)
  const hotels = [
    { kind: 'hotel', event_date: '2026-10-09', end_date: '2026-10-12' },
    { kind: 'hotel', event_date: '2026-10-14', end_date: '2026-10-16' },
  ]
  // Three nights, then a two-night hole, then two nights.
  assert.equal(nightsCovered(hotels, trip), 5)
})

test('overlapping bookings are not double-counted', () => {
  const trip = { start_date: '2026-10-09', end_date: '2026-10-12' }
  const hotels = [
    { kind: 'hotel', event_date: '2026-10-09', end_date: '2026-10-11' },
    { kind: 'hotel', event_date: '2026-10-10', end_date: '2026-10-12' },
  ]
  assert.equal(nightsCovered(hotels, trip), 3)
})

test('a hotel with no end date claims one night, never the whole trip', () => {
  const trip = { start_date: '2026-10-09', end_date: '2026-10-16' }
  assert.equal(nightsCovered([{ kind: 'hotel', event_date: '2026-10-09' }], trip), 1)
})

test('an empty day is named, not counted', () => {
  // "Saturday and Sunday" is a thing somebody acts on. "2 empty days" is not.
  const trip = { start_date: '2026-10-09', end_date: '2026-10-11' }
  const events = [{ kind: 'activity', event_date: '2026-10-10' }]
  assert.deepEqual(emptyDays(events, trip), ['2026-10-09', '2026-10-11'])
})

test('and a trip with no dates claims nothing rather than guessing', () => {
  assert.equal(nightsOf({}), 0)
  assert.equal(nightsCovered([{ event_date: '2026-10-09' }], {}), 0)
  assert.deepEqual(emptyDays([], {}), [])
})
