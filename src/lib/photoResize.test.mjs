import test from 'node:test'
import assert from 'node:assert/strict'
import { fitWithin, savingsLabel, extFor } from './photoResize.js'

test('the long edge is what gets capped, whichever way up the photo is', () => {
  // 50MP landscape and the same shot in portrait should weigh the same.
  assert.deepEqual(fitWithin(8192, 6144, 2048), { width: 2048, height: 1536 })
  assert.deepEqual(fitWithin(6144, 8192, 2048), { width: 1536, height: 2048 })
})

test('a photo already smaller than the cap is left alone, not blown up', () => {
  assert.deepEqual(fitWithin(800, 600, 2048), { width: 800, height: 600 })
  assert.deepEqual(fitWithin(120, 90, 400), { width: 120, height: 90 })
})

test('a panorama keeps its shape rather than being squared off', () => {
  const { width, height } = fitWithin(12000, 2000, 2048)
  assert.equal(width, 2048)
  assert.equal(height, 341)
  assert.ok(Math.abs(width / height - 6) < 0.02)
})

test('degenerate sizes still produce something drawable', () => {
  assert.deepEqual(fitWithin(0, 0, 400), { width: 1, height: 1 })
  // A one-pixel-tall strip must not round its height away to zero.
  assert.equal(fitWithin(10000, 1, 2048).height, 1)
})

test('the saving is stated in the units people think in', () => {
  assert.equal(savingsLabel(11_400_000, 412_000), '11.4 MB → 412 KB · 96% smaller')
  assert.equal(savingsLabel(0, 100), null)
})

test('the extension follows the encoder, so files are named what they are', () => {
  assert.equal(extFor('image/webp'), 'webp')
  assert.equal(extFor('image/jpeg'), 'jpg')
})
