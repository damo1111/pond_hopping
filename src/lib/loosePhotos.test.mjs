import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asMeta, idsIn, looseOnes, pileOf, tripFrom } from './loosePhotos.js'

const row = (id, trip, on, at = null) => ({ id, trip_id: trip, taken_on: on, taken_at: at })

test('a day-only date becomes midday, not midnight', () => {
  // Midnight lands on the wrong side of a timezone about half the time,
  // which is how a photograph taken on the 21st joins the 20th's cluster.
  assert.equal(asMeta(row('a', null, '2026-08-21')).takenAt, '2026-08-21T12:00:00Z')
  // A real timestamp wins over the day it falls in.
  assert.equal(asMeta(row('b', null, '2026-08-21', '2026-08-21T19:04:00Z')).takenAt, '2026-08-21T19:04:00Z')
  assert.equal(asMeta(row('c', null, null)).takenAt, null)
  assert.equal(asMeta(null).takenAt, null)
})

test('loose means no trip, and nothing else', () => {
  const rows = [row('a', null, '2026-08-20'), row('b', 'trip-1', '2026-08-20'), row('c', undefined, '2026-08-20')]
  assert.deepEqual(looseOnes(rows).map((r) => r.id), ['a', 'c'])
  assert.deepEqual(looseOnes([]), [])
  assert.deepEqual(looseOnes(), [])
})

test('a pile splits into the trips it actually was', () => {
  const rows = [
    row('a', null, '2026-08-17'), row('b', null, '2026-08-18'), row('c', null, '2026-08-19'),
    // Five months later — a different trip by any reading.
    row('d', null, '2026-01-04'), row('e', null, '2026-01-05'),
  ]
  const pile = pileOf(rows)
  assert.equal(pile.count, 5)
  assert.equal(pile.clusters.length, 2)
  // Newest first: a list that opens on January buries the answer they wanted.
  assert.equal(pile.clusters[0].start, '2026-08-17')
  assert.equal(pile.clusters[1].start, '2026-01-04')
})

test('photographs already in a trip are not in the pile', () => {
  const rows = [row('a', 'trip-1', '2026-08-17'), row('b', 'trip-1', '2026-08-18')]
  assert.deepEqual(pileOf(rows), { count: 0, clusters: [], undated: [] })
  assert.deepEqual(pileOf([]), { count: 0, clusters: [], undated: [] })
  assert.deepEqual(pileOf(), { count: 0, clusters: [], undated: [] })
})

test('undated ones are counted but do not invent a cluster', () => {
  const pile = pileOf([row('a', null, null), row('b', null, null)])
  assert.equal(pile.count, 2)
  assert.equal(pile.clusters.length, 0)
  assert.equal(pile.undated.length, 2)
})

test('a trip made from a finished cluster has both dates', () => {
  const pile = pileOf([row('a', null, '2024-03-01'), row('b', null, '2024-03-05')])
  const t = tripFrom(pile.clusters[0], Date.parse('2026-08-22T00:00:00Z'))
  assert.equal(t.start_date, '2024-03-01')
  assert.equal(t.end_date, '2024-03-05')
  assert.equal(t.status, 'confirmed')
  assert.ok(t.title)
})

test('and one that might still be going has no end date', () => {
  // Inventing an end either stops the recording early or never stops it.
  const now = Date.parse('2026-08-22T00:00:00Z')
  const pile = pileOf([row('a', null, '2026-08-20'), row('b', null, '2026-08-21')])
  assert.equal(tripFrom(pile.clusters[0], now).end_date, null)
})

test('no cluster, no trip row — never a half-made one', () => {
  assert.equal(tripFrom(null), null)
  assert.equal(tripFrom({}), null)
  assert.equal(tripFrom({ photos: [] }), null)
})

test('the ids to move are the cluster\'s own, and only real ones', () => {
  const pile = pileOf([row('a', null, '2026-08-17'), row('b', null, '2026-08-18')])
  assert.deepEqual(idsIn(pile.clusters[0]).sort(), ['a', 'b'])
  assert.deepEqual(idsIn(null), [])
  assert.deepEqual(idsIn({ photos: [{ id: null }, { id: 'x' }] }), ['x'])
})
