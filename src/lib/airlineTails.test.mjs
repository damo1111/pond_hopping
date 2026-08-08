import { test } from 'node:test'
import assert from 'node:assert/strict'
import { airlineCode, tailLivery } from './airlineTails.js'

// The bug this file exists for: a planned flight carries the number you
// copied off the booking and no airline name, so BA504 fell through to the
// default gold fin while a British Airways tail sat unused in the bundle.
test('a flight number finds the airline when the name is missing', () => {
  assert.equal(tailLivery('BA504').image, '/tails/british-airways.webp')
  assert.equal(tailLivery('BA2667').image, '/tails/british-airways.webp')
  assert.equal(tailLivery('QF12').image, '/tails/qantas.png')
})

test('the name still wins where there is one', () => {
  assert.equal(tailLivery('British Airways').image, '/tails/british-airways.webp')
  assert.equal(tailLivery('Cathay Pacific').image, '/tails/cathay-pacific.png')
})

test('codes are read case-insensitively and with a space or dash', () => {
  assert.equal(airlineCode('ba 504'), 'BA')
  assert.equal(airlineCode('BA-504'), 'BA')
  assert.equal(airlineCode('  ba504  '), 'BA')
})

// Low-cost carriers use letter-digit and digit-letter codes.
test('mixed alphanumeric codes are read', () => {
  assert.equal(airlineCode('U21234'), 'U2')
  assert.equal(airlineCode('9W22'), '9W')
  assert.equal(airlineCode('4U1'), '4U')
})

test('things that are not flight numbers are not codes', () => {
  assert.equal(airlineCode('British Airways'), null)
  assert.equal(airlineCode('LHR'), null)
  assert.equal(airlineCode(''), null)
  assert.equal(airlineCode(null), null)
  assert.equal(airlineCode('BA'), null)
  assert.equal(airlineCode('BA12345'), null)
})

// An unknown airline must look deliberate, not broken — and must never pick
// up a livery it has no right to.
test('an unknown airline gets the plain fin, not somebody else’s tail', () => {
  const unknown = tailLivery('XX999')
  assert.equal(unknown.image, undefined)
  assert.equal(unknown.emblem, 'default')
  assert.equal(tailLivery(null).emblem, 'default')
  assert.equal(tailLivery(undefined).emblem, 'default')
})
