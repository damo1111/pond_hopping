import test from 'node:test'
import assert from 'node:assert/strict'
import { tripPhase, sectionTrips } from './tripPhase.js'

const TODAY = new Date('2026-08-04T09:00:00Z')

const trip = (over) => ({ slug: 'x', title: 'X', start_date: null, end_date: null, chapter: null, ...over })

test('a trip that has finished is past', () => {
  assert.equal(tripPhase(trip({ start_date: '2025-01-01', end_date: '2025-01-10' }), TODAY), 'past')
})

test('a trip that has not started is upcoming', () => {
  assert.equal(tripPhase(trip({ start_date: '2026-09-11', end_date: '2026-09-28' }), TODAY), 'upcoming')
})

test('today falling inside the dates is live', () => {
  assert.equal(tripPhase(trip({ start_date: '2026-08-01', end_date: '2026-08-09' }), TODAY), 'live')
})

test('the first and last day of a trip both count as live', () => {
  assert.equal(tripPhase(trip({ start_date: '2026-08-04', end_date: '2026-08-09' }), TODAY), 'live')
  assert.equal(tripPhase(trip({ start_date: '2026-07-20', end_date: '2026-08-04' }), TODAY), 'live')
})

test('a single-day trip with no end date is live on the day', () => {
  assert.equal(tripPhase(trip({ start_date: '2026-08-04' }), TODAY), 'live')
})

test('no dates at all is someday, not broken', () => {
  assert.equal(tripPhase(trip({ title: 'Samoa' }), TODAY), 'someday')
})

test('sections drop the ones with nothing in them', () => {
  const s = sectionTrips([trip({ slug: 'a', start_date: '2020-01-01', end_date: '2020-01-05' })], TODAY)
  assert.deepEqual(s.map((x) => x.id), ['past'])
})

test('upcoming reads soonest first regardless of sort_order', () => {
  const s = sectionTrips(
    [
      trip({ slug: 'later', start_date: '2027-01-01', sort_order: 0 }),
      trip({ slug: 'sooner', start_date: '2026-09-01', sort_order: 1 }),
    ],
    TODAY
  )
  const up = s.find((x) => x.id === 'upcoming')
  assert.deepEqual(up.items.map((i) => i.trip.slug), ['sooner', 'later'])
})

test('someday trails the trips that actually have dates', () => {
  const s = sectionTrips(
    [trip({ slug: 'samoa' }), trip({ slug: 'london', start_date: '2026-09-01' })],
    TODAY
  )
  const up = s.find((x) => x.id === 'upcoming')
  assert.deepEqual(up.items.map((i) => i.trip.slug), ['london', 'samoa'])
})

test('history still collapses into chapters, the future never does', () => {
  const s = sectionTrips(
    [
      trip({ slug: 'g1', chapter: '2024 Gap Year', start_date: '2024-02-01', end_date: '2024-02-20' }),
      trip({ slug: 'g2', chapter: '2024 Gap Year', start_date: '2024-03-01', end_date: '2024-03-20' }),
      trip({ slug: 'soon', chapter: '2024 Gap Year', start_date: '2026-12-01' }),
    ],
    TODAY
  )
  const past = s.find((x) => x.id === 'past')
  assert.deepEqual(past.items.map((i) => i.type), ['chapter'])
  assert.equal(past.items[0].trips.length, 2)
  const up = s.find((x) => x.id === 'upcoming')
  assert.deepEqual(up.items.map((i) => i.type), ['trip'])
})

test('a trip nobody has closed is still happening', () => {
  // end_date || start_date made an unclosed trip one day long, so it fell
  // out of Right now on the morning of day two — while somebody was on it.
  // An unclosed trip is the ordinary state of a trip you are having: the end
  // date is what you fill in when you get home.
  const open = { start_date: '2026-08-13', end_date: null }
  assert.equal(tripPhase(open, new Date('2026-08-18T12:00:00Z')), 'live')
  assert.equal(tripPhase(open, new Date('2026-08-14T12:00:00Z')), 'live')
  // Prove the check can fail, and prove the other end holds: one left open
  // in 2019 has long since stopped claiming to be happening.
  assert.equal(tripPhase({ start_date: '2019-04-01', end_date: null }, new Date('2026-08-18T12:00:00Z')), 'past')
  assert.equal(tripPhase(open, new Date('2026-08-12T12:00:00Z')), 'upcoming')
})
