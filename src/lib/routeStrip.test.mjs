import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripOf, atFraction } from './routeStrip.js'

const leg = (id, dep, arr) => ({ id, dep_airport: dep, arr_airport: arr })

test('nothing in, nothing to draw', () => {
  const { stops, legs } = stripOf([])
  assert.deepEqual(stops, [])
  assert.equal(legs.size, 0)
})

test('one flight is two stops', () => {
  const { stops, legs } = stripOf([leg('a', 'MEL', 'KUL')])
  assert.deepEqual(stops, ['MEL', 'KUL'])
  assert.deepEqual(legs.get('a'), [0, 1])
})

// Landing at Kuala Lumpur and leaving from it is one dot, not two.
test('a connection shares its stop', () => {
  const { stops, legs } = stripOf([leg('a', 'MEL', 'KUL'), leg('b', 'KUL', 'BKK')])
  assert.deepEqual(stops, ['MEL', 'KUL', 'BKK'])
  assert.deepEqual(legs.get('a'), [0, 1])
  assert.deepEqual(legs.get('b'), [1, 2])
})

// The one that makes this a file rather than three lines: BKK appears twice
// on this trip, so looking the code up cannot say which dot is meant.
test('a repeated airport gets the right dot, not the first one', () => {
  const thailand = [
    leg('1', 'MEL', 'KUL'),
    leg('2', 'KUL', 'BKK'),
    leg('3', 'BKK', 'KBV'),
    leg('4', 'KBV', 'DMK'),
    leg('5', 'DMK', 'BKK'),
    leg('6', 'BKK', 'KUL'),
    leg('7', 'KUL', 'MEL'),
  ]
  const { stops, legs } = stripOf(thailand)
  assert.deepEqual(stops, ['MEL', 'KUL', 'BKK', 'KBV', 'DMK', 'BKK', 'KUL', 'MEL'])
  assert.deepEqual(legs.get('3'), [2, 3], 'the first Bangkok')
  assert.deepEqual(legs.get('6'), [5, 6], 'the second Bangkok, not the first')
})

// Reusing an earlier match would draw the leg as a line running backwards
// across the whole strip.
test('a leg never points backwards', () => {
  const { legs } = stripOf([leg('1', 'BKK', 'KBV'), leg('2', 'KBV', 'BKK')])
  const [from, to] = legs.get('2')
  assert.ok(to > from, `${from} → ${to}`)
})

test('a flight that lands where it took off occupies one stop', () => {
  const { stops, legs } = stripOf([leg('a', 'YMML', 'YMML')])
  assert.deepEqual(stops, ['YMML'])
  assert.deepEqual(legs.get('a'), [0, 0])
})

test('a leg with a missing airport is skipped rather than drawn wrong', () => {
  const { stops, legs } = stripOf([leg('a', 'MEL', null), leg('b', 'MEL', 'KUL')])
  assert.deepEqual(stops, ['MEL', 'KUL'])
  assert.equal(legs.has('a'), false)
  assert.deepEqual(legs.get('b'), [0, 1])
})

test('a gap in the itinerary starts a new stop rather than joining up', () => {
  const { stops, legs } = stripOf([leg('a', 'MEL', 'KUL'), leg('b', 'SIN', 'BKK')])
  assert.deepEqual(stops, ['MEL', 'KUL', 'SIN', 'BKK'])
  assert.deepEqual(legs.get('b'), [2, 3])
})

test('positions along the strip run from nothing to all of it', () => {
  assert.equal(atFraction(0, 4), 0)
  assert.equal(atFraction(3, 4), 1)
  assert.equal(atFraction(1, 3), 0.5)
  assert.equal(atFraction(0, 1), 0, 'a single stop sits at the start rather than dividing by zero')
  assert.equal(atFraction(9, 4), 1, 'and nothing runs off the end')
})
