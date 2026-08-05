import test from 'node:test'
import assert from 'node:assert/strict'
import { homeCoords, homePov } from './homePov.js'

test('a zone we know by name lands on its city', () => {
  const { lat, lng, known } = homeCoords('Europe/London')
  assert.equal(known, true)
  assert.ok(Math.abs(lat - 51.5) < 0.5 && Math.abs(lng - -0.1) < 0.5)
})

test('a zone we do not know still lands on the right continent', () => {
  const { lat, lng, known } = homeCoords('Europe/Ljubljana')
  assert.equal(known, true)
  assert.ok(lat > 35 && lat < 60, 'somewhere in Europe')
  assert.ok(lng > -10 && lng < 40)
})

test('the southern hemisphere is not treated as the northern one', () => {
  assert.ok(homeCoords('Australia/Perth').lat < 0)
  assert.ok(homeCoords('Pacific/Auckland').lat < 0)
  assert.ok(homeCoords('America/Sao_Paulo').lat < 0)
})

test('a multi-part zone name resolves rather than falling through', () => {
  const { known } = homeCoords('America/Argentina/Buenos_Aires')
  assert.equal(known, true)
})

test('nonsense claims nothing and says so', () => {
  const { known } = homeCoords('Not/A/Zone')
  assert.equal(known, false)
})

test('an empty zone claims nothing rather than guessing', () => {
  assert.equal(homeCoords('').known, false)
})

test('the point of view carries an altitude', () => {
  assert.equal(homePov('Asia/Tokyo').altitude, 1.9)
  assert.equal(homePov('Asia/Tokyo', 1.2).altitude, 1.2)
})
