import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PLACES, cacheKey, round4 } from './coordKey.js'

test('a coordinate rounds to about eleven metres', () => {
  assert.equal(PLACES, 4)
  assert.equal(round4(41.89021456), 41.8902)
  assert.equal(round4(12.49223999), 12.4922)
})

test('two fixes at the same spot share a key', () => {
  // Consecutive photographs of one building differ in the sixth decimal.
  assert.equal(cacheKey(41.890214, 12.492239), cacheKey(41.890231, 12.492244))
})

test('and two real places do not', () => {
  // The Colosseum and the Trevi Fountain.
  assert.notEqual(cacheKey(41.8902, 12.4922), cacheKey(41.9009, 12.4833))
})

test('the key survives negative and zero coordinates', () => {
  assert.equal(cacheKey(-33.8688, 151.2093), '-33.8688,151.2093')
  assert.equal(cacheKey(0, 0), '0,0')
})
