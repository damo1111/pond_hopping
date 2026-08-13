import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tripColor, TRIP_COLORS } from './tripColors.js'

test('a trip in the map gets its own colour', () => {
  assert.equal(tripColor('china-japan'), '#D9614F')
})

test('the example copy of a trip is the same colour as the trip', () => {
  // It is the same journey. `china-japan-example` fell through to plain gold,
  // which only showed once an example with no photograph took over and its
  // card had to be drawn rather than photographed.
  assert.equal(tripColor('china-japan-example'), TRIP_COLORS['china-japan'])
  assert.equal(tripColor('rome-2024-example'), TRIP_COLORS['rome-2024'])
})

test('anything unknown still gets the house gold', () => {
  assert.equal(tripColor('trip-from-12-aug-mspkukcw'), '#A8842C')
  assert.equal(tripColor(''), '#A8842C')
  assert.equal(tripColor(undefined), '#A8842C')
  // Not a trip that exists, and stripping the suffix does not make it one.
  assert.equal(tripColor('atlantis-example'), '#A8842C')
})
