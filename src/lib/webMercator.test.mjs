import test from 'node:test'
import assert from 'node:assert/strict'
import { tileFrame, lonToX, latToY } from './webMercator.js'

// A ~2km loop in Hong Kong, and a ~1km straight line in Seoul.
const hkLoop = Array.from({ length: 40 }, (_, i) => {
  const a = (i / 40) * Math.PI * 2
  return [22.28 + Math.sin(a) * 0.009, 114.17 + Math.cos(a) * 0.009]
})
const seoulLine = Array.from({ length: 20 }, (_, i) => [37.52 + i * 0.0005, 126.99 + i * 0.0005])

test('the projection agrees with the known corners of the world', () => {
  // At zoom 0 the whole earth is one 256px tile.
  assert.equal(lonToX(-180, 0), 0)
  assert.equal(lonToX(180, 0), 256)
  assert.ok(Math.abs(lonToX(0, 0) - 128) < 1e-9)
  assert.ok(Math.abs(latToY(0, 0) - 128) < 1e-9)
  // Mercator's poles are at the top and bottom of the square, not at ±90.
  assert.ok(latToY(85.05112878, 0) < 0.001)
  assert.ok(latToY(-85.05112878, 0) > 255.999)
})

test('latitudes past Mercator clamp instead of running to infinity', () => {
  assert.ok(Number.isFinite(latToY(90, 4)))
  assert.ok(Number.isFinite(latToY(-90, 4)))
})

test('the route fits inside the box it was given', () => {
  const f = tileFrame(hkLoop, 96, 64)
  const nums = f.path.match(/-?\d+(\.\d+)?/g).map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0)
  const ys = nums.filter((_, i) => i % 2 === 1)
  assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= 96, `x out of box: ${Math.min(...xs)}–${Math.max(...xs)}`)
  assert.ok(Math.min(...ys) >= 0 && Math.max(...ys) <= 64, `y out of box: ${Math.min(...ys)}–${Math.max(...ys)}`)
})

test('and is centred in it, not shoved against a corner', () => {
  const f = tileFrame(hkLoop, 96, 64)
  const nums = f.path.match(/-?\d+(\.\d+)?/g).map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0)
  const ys = nums.filter((_, i) => i % 2 === 1)
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 48) < 0.5)
  assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 32) < 0.5)
})

test('a shorter run gets a closer zoom than a longer one', () => {
  const short = tileFrame(seoulLine, 96, 64).zoom
  const long = tileFrame(hkLoop, 96, 64).zoom
  assert.ok(short > long, `expected the 1km line to zoom in further than the 2km loop (${short} vs ${long})`)
})

test('a thumbnail needs only a handful of tiles', () => {
  const f = tileFrame(hkLoop, 96, 64)
  assert.ok(f.tiles.length >= 1 && f.tiles.length <= 4, `got ${f.tiles.length} tiles`)
  for (const t of f.tiles) {
    assert.ok(Number.isInteger(t.x) && Number.isInteger(t.y))
    assert.ok(t.x >= 0 && t.x < 2 ** t.z, `tile x ${t.x} outside the world at z${t.z}`)
    assert.ok(t.y >= 0 && t.y < 2 ** t.z, `tile y ${t.y} outside the world at z${t.z}`)
  }
})

test('the tiles actually cover the box they are placed in', () => {
  const f = tileFrame(hkLoop, 96, 64)
  const lefts = f.tiles.map((t) => t.left)
  const tops = f.tiles.map((t) => t.top)
  assert.ok(Math.min(...lefts) <= 0 && Math.max(...lefts) + 256 >= 96)
  assert.ok(Math.min(...tops) <= 0 && Math.max(...tops) + 256 >= 64)
})

test('a route across the date line wraps rather than asking for tile -1', () => {
  const f = tileFrame([[0, 179.98], [0.01, -179.98]], 96, 64)
  for (const t of f.tiles) assert.ok(t.x >= 0 && t.x < 2 ** t.z, `wrapped badly: x=${t.x} z=${t.z}`)
})

test('too little to draw returns nothing rather than a broken frame', () => {
  assert.equal(tileFrame([], 96, 64), null)
  assert.equal(tileFrame([[1, 2]], 96, 64), null)
  assert.equal(tileFrame(null, 96, 64), null)
  assert.equal(tileFrame(hkLoop, 0, 64), null)
})

test('junk points are dropped, not projected to NaN', () => {
  const f = tileFrame([[22.28, 114.17], null, [22.29, 114.18], ['x', 'y']], 96, 64)
  assert.ok(f && !f.path.includes('NaN'), f?.path)
})
