import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLEAR_WIN,
  MUCH_TIGHTER,
  candidates,
  describeRoute,
  overlap,
  routeClusters,
  specificity,
} from './photoRouting.js'

const cluster = (start, end = start, count = 1) => ({ start, end, count })
const trip = (title, start_date, end_date = null) => ({ title, start_date, end_date })

const rome = trip('Rome', '2024-01-12', '2024-01-19')
const amsterdam = trip('Amsterdam with my mother', '2024-03-04', '2024-03-08')
const voyage = trip('The Voyage', '2024-01-01', null) // open-ended

test('photos inside a trip belong to it, with nothing to ask', () => {
  const [r] = routeClusters([cluster('2024-01-13', '2024-01-17', 40)], [rome, amsterdam])
  assert.equal(r.decision, 'one')
  assert.equal(r.trip.title, 'Rome')
  assert.equal(describeRoute(r), '40 photos → Rome')
})

test('photos that match nothing get a trip of their own, dates filled in', () => {
  const [r] = routeClusters([cluster('2024-06-02', '2024-06-06', 6)], [rome, amsterdam])
  assert.equal(r.decision, 'new')
  assert.equal(r.trip, null)
  assert.equal(describeRoute(r), '6 photos → a new trip, 2024-06-02 to 2024-06-06')
})

test('the day you fly counts as part of the trip', () => {
  // Departure lounge photos on the morning of the 12th, and the flight home
  // on the 20th. Both belong to Rome, not to the fortnight either side.
  assert.ok(overlap(cluster('2024-01-11'), rome) > 0)
  assert.ok(overlap(cluster('2024-01-20'), rome) > 0)
  assert.equal(overlap(cluster('2024-01-09'), rome), 0)
})

test('a shorter trip beats a long open-ended one for the same day', () => {
  // A year-long trip left open and a week in Rome can both contain a
  // Tuesday. The week is the better answer.
  const found = candidates(cluster('2024-01-15'), [voyage, rome])
  assert.equal(found[0].trip.title, 'Rome')
})

test('two trips that both genuinely fit is a question, not a guess', () => {
  const overlapping = trip('Work in Italy', '2024-01-10', '2024-01-22')
  const [r] = routeClusters([cluster('2024-01-13', '2024-01-17', 12)], [rome, overlapping])
  assert.equal(r.decision, 'choose')
  assert.equal(r.trip, null)
  assert.equal(r.matches.length, 2)
  assert.match(describeRoute(r), /Rome or Work in Italy\?|Work in Italy or Rome\?/)
})

test('one trip clearly better than the other is not a question', () => {
  // Photos across a fortnight: Rome covers half of them, the longer trip
  // covers all. Ahead by more than CLEAR_WIN, so it is simply the answer.
  const fortnight = trip('Italy, at length', '2024-01-05', '2024-01-30')
  const [r] = routeClusters([cluster('2024-01-06', '2024-01-28', 90)], [rome, fortnight])
  assert.equal(r.decision, 'one')
  assert.equal(r.trip.title, 'Italy, at length')
})

test('an open-ended trip stops claiming days eventually', () => {
  // Otherwise a trip somebody left open in 2019 swallows every photo
  // uploaded since.
  assert.ok(overlap(cluster('2024-02-01'), voyage) > 0)
  assert.equal(overlap(cluster('2025-06-01'), voyage), 0)
})

test('several runs of photos are routed independently', () => {
  const routes = routeClusters(
    [cluster('2024-01-13', '2024-01-17', 40), cluster('2024-03-05', '2024-03-07', 12), cluster('2024-09-01', '2024-09-02', 6)],
    [rome, amsterdam]
  )
  assert.deepEqual(routes.map((r) => r.decision), ['one', 'one', 'new'])
  assert.deepEqual(routes.map((r) => r.trip?.title ?? null), ['Rome', 'Amsterdam with my mother', null])
})

test('trips with no dates cannot claim anything', () => {
  assert.deepEqual(candidates(cluster('2024-01-13'), [trip('Samoa', null)]), [])
  assert.equal(routeClusters([cluster('2024-01-13')], [])[0].decision, 'new')
  assert.deepEqual(routeClusters(), [])
})

test('a single day reads as one date rather than a range', () => {
  const [r] = routeClusters([cluster('2024-06-02', '2024-06-02', 1)], [])
  assert.equal(describeRoute(r), '1 photo → a new trip, 2024-06-02')
})

test('CLEAR_WIN is the margin, not a coin toss', () => {
  // Documented rather than assumed: two trips within this of each other are
  // a question, and the test exists so changing the number is deliberate.
  assert.ok(CLEAR_WIN > 0 && CLEAR_WIN < 1)
})

test('the tie-break is specificity, and it is the whole reason this works', () => {
  // Coverage alone says a Tuesday belongs equally to a week in Rome and to
  // a trip left open four months ago. It plainly does not.
  const day = cluster('2024-01-15')
  assert.equal(overlap(day, rome), overlap(day, voyage))
  assert.ok(specificity(day, rome) > specificity(day, voyage) * MUCH_TIGHTER)

  const [r] = routeClusters([day], [voyage, rome])
  assert.equal(r.decision, 'one')
  assert.equal(r.trip.title, 'Rome')
})
