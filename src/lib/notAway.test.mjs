import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KEEP, SAME_PLACE_KM, clearNotAway, isNotAway, readNotAway, rememberNotAway } from './notAway.js'

// A localStorage that behaves, and one that does not.
const store = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  }
}
const dead = { getItem() { throw new Error('off') }, setItem() { throw new Error('off') }, removeItem() { throw new Error('off') } }

const GLASGOW = { lat: 55.86, lon: -4.25 }
const EDINBURGH = { lat: 55.95, lon: -3.19 }   // 66 km from Glasgow
const LONDON = { lat: 51.5, lon: -0.13 }
const BANFF = { lat: 51.18, lon: -115.57 }

test('the answer to the wrong question is kept', () => {
  const s = store()
  rememberNotAway(GLASGOW, s)
  assert.equal(readNotAway(s).length, 1)
  assert.equal(isNotAway(GLASGOW, readNotAway(s)), true)
})

test('and it covers the city, not the pixel', () => {
  // The centre of a cloud of photographs is never the same twice.
  const s = store()
  rememberNotAway(GLASGOW, s)
  assert.equal(isNotAway({ lat: 55.88, lon: -4.31 }, readNotAway(s)), true)
  // Edinburgh is 66 km away and is the same commute, so it counts too —
  // deliberately generous, because being asked twice is the thing being
  // fixed and a too-tight radius fixes nothing.
  assert.ok(SAME_PLACE_KM > 66)
  assert.equal(isNotAway(EDINBURGH, readNotAway(s)), true)
})

test('but it does not quietly cover the whole country', () => {
  const s = store()
  rememberNotAway(GLASGOW, s)
  assert.equal(isNotAway(LONDON, readNotAway(s)), false)
  assert.equal(isNotAway(BANFF, readNotAway(s)), false)
})

test('the same place twice is one entry, not two', () => {
  const s = store()
  rememberNotAway(GLASGOW, s)
  rememberNotAway({ lat: 55.87, lon: -4.26 }, s)
  rememberNotAway({ lat: 55.85, lon: -4.24 }, s)
  assert.equal(readNotAway(s).length, 1)
  // The newest reading wins, so a list of forty near-identical points of one
  // city never builds up.
  assert.equal(readNotAway(s)[0].lat, 55.85)
})

test('somebody who moves stops being measured against where they used to live', () => {
  const s = store()
  for (let i = 0; i < KEEP + 4; i++) rememberNotAway({ lat: 10 + i * 3, lon: 0 }, s)
  const kept = readNotAway(s)
  assert.equal(kept.length, KEEP)
  // Newest first, oldest gone.
  assert.equal(kept[0].lat, 10 + (KEEP + 3) * 3)
  assert.ok(!kept.some((p) => p.lat === 10))
})

test('nonsense is never stored and never matched', () => {
  const s = store()
  for (const bad of [null, undefined, {}, { lat: 'x', lon: 1 }, { lat: 1 }, { lat: NaN, lon: 0 }]) {
    rememberNotAway(bad, s)
    assert.equal(isNotAway(bad, [GLASGOW]), false)
  }
  assert.deepEqual(readNotAway(s), [])
})

test('storage being off is not an error anywhere', () => {
  // Private browsing, or a WebView with storage disabled. Not remembering is
  // recoverable; throwing during an upload is not.
  assert.deepEqual(readNotAway(dead), [])
  assert.doesNotThrow(() => clearNotAway(dead))
  // The answer still stands for this session even though nothing was
  // written — same contract as writeHome, which also hands back what it was
  // given rather than pretending the answer was never made.
  assert.deepEqual(rememberNotAway(GLASGOW, dead), [{ lat: GLASGOW.lat, lon: GLASGOW.lon }])
})

test('rubbish in storage reads as nothing rather than throwing', () => {
  const s = store()
  s.setItem('pond:not-away', 'not json at all')
  assert.deepEqual(readNotAway(s), [])
  s.setItem('pond:not-away', '{"lat":1}')
  assert.deepEqual(readNotAway(s), [])
  s.setItem('pond:not-away', '[{"lat":1,"lon":2},{"nope":true}]')
  assert.deepEqual(readNotAway(s), [{ lat: 1, lon: 2 }])
})

test('clearing forgets the lot', () => {
  const s = store()
  rememberNotAway(GLASGOW, s)
  clearNotAway(s)
  assert.deepEqual(readNotAway(s), [])
})
