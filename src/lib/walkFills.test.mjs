import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GAP_WORTH_EXPLAINING, coveredBy, gapsIn, onFootIn, unseenPart } from './walkFills.js'

const seg = (from, to) => ({ from, to, minutes: 30, stayed: true })

test('a gap is the hole between one stop and the next', () => {
  const gaps = gapsIn([
    seg('2024-01-23T09:00:00Z', '2024-01-23T10:00:00Z'),
    seg('2024-01-23T13:00:00Z', '2024-01-23T14:00:00Z'),
  ])
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].minutes, 180)
})

test('and a short one is not a hole anybody wonders about', () => {
  const gaps = gapsIn([
    seg('2024-01-23T09:00:00Z', '2024-01-23T10:00:00Z'),
    seg('2024-01-23T10:20:00Z', '2024-01-23T11:00:00Z'),
  ])
  assert.deepEqual(gaps, [])
  assert.ok(GAP_WORTH_EXPLAINING >= 30)
})

test('a walk running through a gap explains it', () => {
  const gap = { from: '2024-01-23T10:00:00Z', to: '2024-01-23T12:00:00Z', minutes: 120 }
  const walk = { sport: 'walk', started_at: '2024-01-23T10:05:00Z', duration_min: 110 }
  assert.ok(coveredBy(gap, walk) >= 110)
})

test('a walk that touches the edge of it does not', () => {
  // "You walked a bit" about two missing hours is padding, not an answer.
  const gap = { from: '2024-01-23T10:00:00Z', to: '2024-01-23T12:00:00Z', minutes: 120 }
  const walk = { sport: 'walk', started_at: '2024-01-23T11:50:00Z', duration_min: 15 }
  assert.ok(coveredBy(gap, walk) <= 10)
})

test('a ride is not how a day was spent on foot', () => {
  const gap = { from: '2024-01-23T10:00:00Z', to: '2024-01-23T12:00:00Z', minutes: 120 }
  assert.equal(coveredBy(gap, { sport: 'ride', started_at: '2024-01-23T10:00:00Z', duration_min: 120 }), 0)
  assert.equal(coveredBy(gap, { sport: 'swim', started_at: '2024-01-23T10:00:00Z', duration_min: 120 }), 0)
})

test('the day says how far you went on foot, and which gap it fills', () => {
  const day = {
    segments: [
      seg('2024-01-23T09:00:00Z', '2024-01-23T10:00:00Z'),
      seg('2024-01-23T13:00:00Z', '2024-01-23T14:00:00Z'),
    ],
  }
  const walk = { sport: 'walk', distance_km: '8.2', started_at: '2024-01-23T10:05:00Z', duration_min: 170 }
  const { km, explained } = onFootIn(day, [walk])
  assert.equal(km, 8.2)
  assert.equal(explained.length, 1)
  assert.equal(explained[0].minutes, 180)
})

test('no walk means no claim about the gap', () => {
  const day = { segments: [seg('2024-01-23T09:00:00Z', '2024-01-23T10:00:00Z')] }
  assert.deepEqual(onFootIn(day, []), { km: 0, explained: [] })
  assert.deepEqual(onFootIn(day, [{ sport: 'ride', distance_km: '40' }]), { km: 0, explained: [] })
})

test('the parts of a route the photographs never saw', () => {
  const stops = [{ lat: 41.8902, lon: 12.4922 }]
  const coords = [
    [41.8902, 12.4922], // at the stop
    [41.9100, 12.5100], // well away from it
  ]
  const unseen = unseenPart(coords, stops)
  assert.equal(unseen.length, 1)
  assert.deepEqual(unseen[0], [41.91, 12.51])
})
