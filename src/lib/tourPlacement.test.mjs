import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardSide } from './tourPlacement.js'

const rect = (top, bottom) => ({ top, bottom })

test('a target low on the screen gets the card above it', () => {
  // The exact shape of the hero and the demo card on Home: sitting in the
  // bottom third of an 844px viewport, close enough to the nav that
  // "below" would mean squeezed between the target and the nav.
  assert.equal(cardSide(rect(700, 790), 844), 'above')
})

test('a target near the top gets the card below it', () => {
  assert.equal(cardSide(rect(60, 150), 844), 'below')
})

test('the bottom nav counts as occupied, not empty, space', () => {
  // Dead centre by raw pixels — but the nav eats 90px of the room below,
  // so above is genuinely roomier once that is accounted for.
  assert.equal(cardSide(rect(377, 467), 844), 'above')
})

test('no rect to measure defaults to above, the common case here', () => {
  assert.equal(cardSide(null, 844), 'above')
})
