import { test } from 'node:test'
import assert from 'node:assert/strict'
import { overviewOf } from './homePov.js'

const FALLBACK = { lat: -8, lng: 122 }

test('a collection in one place is centred on it', () => {
  // The two example trips a signed-out visitor sees: Rome and Lisbon.
  const pov = overviewOf([[41.8, 12.24], [51.47, -0.45], [38.77, -9.13]])
  assert.ok(pov.lat > 30 && pov.lat < 55, `lat ${pov.lat}`)
  assert.ok(pov.lng > -10 && pov.lng < 15, `lng ${pov.lng}`)
})

// The bug that is invisible on one person's data and ruinous on another's.
test('longitude is averaged as an angle, not as a number', () => {
  // Auckland and Los Angeles. Arithmetically these average to 28° — Egypt,
  // a quarter of the world from either of them.
  const pov = overviewOf([[-37, 174.8], [34, -118.4]])
  assert.ok(Math.abs(pov.lng) > 140, `expected the Pacific, got ${pov.lng}`)
})

test('the antimeridian is not a wall', () => {
  const pov = overviewOf([[0, 179], [0, -179]])
  assert.ok(Math.abs(pov.lng) > 179, `expected ±180, got ${pov.lng}`)
})

test('nothing to average falls back rather than inventing a place', () => {
  assert.deepEqual(overviewOf([], FALLBACK), FALLBACK)
  assert.deepEqual(overviewOf(null, FALLBACK), FALLBACK)
  assert.deepEqual(overviewOf([[NaN, 5], ['a', 'b'], null], FALLBACK), FALLBACK)
})

test('points that cancel exactly have no answer, and say so', () => {
  assert.deepEqual(overviewOf([[0, 0], [0, 180]], FALLBACK), FALLBACK)
})

test('one point is its own centre', () => {
  assert.deepEqual(overviewOf([[41.8, 12.24]]), { lat: 41.8, lng: 12.24 })
})
