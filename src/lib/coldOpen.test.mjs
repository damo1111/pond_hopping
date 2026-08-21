import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GLOBE, LEGS, PILE, TARGETS, arcUp, regrow, samplePath, swellTo } from './coldOpen.js'

// The control point of `M a Q c b` — the whole thing this file exists to get right.
const control = (d) => d.match(/Q([\d.-]+) ([\d.-]+)/).slice(1, 3).map(Number)

test('every arc bows the same way — up-screen, never down', () => {
  // Prove the check can fail: without the normal-flipping, an arc drawn
  // right-to-left bows under the globe and the family stops reading as one
  // set of routes. Both directions of the same pair must bow to the same side.
  for (const [a, b] of LEGS) {
    const [, cy] = control(arcUp(a, b))
    const mid = (a[1] + b[1]) / 2
    assert.ok(cy < mid, `arc ${JSON.stringify(a)}→${JSON.stringify(b)} bows downward`)
  }
})

test('and bows the same way whichever end you start from', () => {
  const a = [89, 112]
  const b = [211, 135]
  assert.deepEqual(control(arcUp(a, b)), control(arcUp(b, a)))
})

test('a longer hop bows further than a short one', () => {
  // Fixed lift was the other way this could have been written, and it makes
  // long hops look flat next to short ones.
  const short = control(arcUp([140, 130], [160, 130]))
  const long = control(arcUp([90, 130], [210, 130]))
  assert.ok(130 - long[1] > 130 - short[1])
})

test('a zero-length leg does not divide by zero', () => {
  assert.doesNotThrow(() => arcUp([100, 100], [100, 100]))
})

test('the sampled flight path starts and ends on its own arc', () => {
  const a = [89, 112]
  const b = [211, 135]
  const pts = samplePath(a, b)
  assert.deepEqual(pts[0], a)
  assert.deepEqual(pts[pts.length - 1], b)
  assert.equal(pts.length, 6)
})

test('and every sampled point lifts above the straight line between the ends', () => {
  const pts = samplePath([89, 112], [211, 135])
  for (const [x, y] of pts.slice(1, -1)) {
    const t = (x - 89) / (211 - 89)
    assert.ok(y < 112 + t * (135 - 112), `point ${x},${y} sags below the chord`)
  }
})

test('the pile is rescaled onto whatever size the globe actually is', () => {
  // The heap was composed against a 52px globe and ships against a 66px one.
  // Its centre must move with the globe's, or the photographs land beside it.
  assert.deepEqual(regrow([150, 112]), [GLOBE.cx, GLOBE.cy])
  const [, y] = regrow([150, 60])
  assert.ok(y < GLOBE.cy, 'a point above the old centre stays above the new one')
})

test('every chip has somewhere real to land', () => {
  PILE.forEach((row, i) => {
    assert.equal(row.length, 7, `pile row ${i} is malformed`)
    assert.ok(TARGETS[i % TARGETS.length], `chip ${i} has no target`)
  })
})

test('the swell keeps the globe centred while it grows', () => {
  const { x, y, scale } = swellTo(1.62)
  // Where the centre ends up after translate-then-scale.
  assert.ok(Math.abs(x + GLOBE.cx * scale - GLOBE.cx) < 0.2)
  assert.ok(Math.abs(y + GLOBE.cy * scale - GLOBE.cy) < 0.2)
})

test('and a swell of 1 moves nothing at all', () => {
  assert.deepEqual(swellTo(1), { x: 0, y: 0, scale: 1 })
})
