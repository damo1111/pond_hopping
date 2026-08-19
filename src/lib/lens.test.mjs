import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SWIPE_MIN, atEnd, atStart, keptPlace, saidAs, step, swipedTo } from './lens.js'

test('stepping stops at the ends rather than wrapping', () => {
  // Wrapping is right for a carousel you idle through and wrong for a set
  // you work along: swiping off the last photograph onto the first reads as
  // the app losing your place.
  assert.equal(step(0, 1, 5), 1)
  assert.equal(step(4, 1, 5), 4)
  assert.equal(step(0, -1, 5), 0)
  assert.equal(step(2, -1, 5), 1)
  // A jump past either end lands on the end, not outside it.
  assert.equal(step(2, 99, 5), 4)
  assert.equal(step(2, -99, 5), 0)
})

test('and an empty or nonsense set does not produce an index into nothing', () => {
  assert.equal(step(3, 1, 0), 0)
  assert.equal(step(NaN, 1, 5), 1)
  assert.equal(step(0, 1, NaN), 0)
})

test('the ends know they are ends', () => {
  assert.equal(atStart(0), true)
  assert.equal(atStart(1), false)
  assert.equal(atEnd(4, 5), true)
  assert.equal(atEnd(3, 5), false)
})

test('the viewer follows the photograph, not the number', () => {
  // Photographs are removed and imports land while somebody is looking, so
  // the index points into a list that is no longer the same list.
  const photos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.equal(keptPlace({ id: 'b', at: 1 }, photos), 1)
  // Two arrived at the front: still on b, which is now number three.
  assert.equal(keptPlace({ id: 'b', at: 1 }, [{ id: 'x' }, { id: 'y' }, ...photos]), 3)
})

test('and when the one being looked at is deleted, it holds the position', () => {
  // Which for a removal is the photograph that slid into its place — what
  // somebody deleting a run of them expects to be looking at.
  assert.equal(keptPlace({ id: 'b', at: 1 }, [{ id: 'a' }, { id: 'c' }]), 1)
  // Deleting the last one lands on the new last one, not past the end.
  assert.equal(keptPlace({ id: 'c', at: 2 }, [{ id: 'a' }, { id: 'b' }]), 1)
})

test('and an emptied set says close rather than showing photograph minus one', () => {
  assert.equal(keptPlace({ id: 'a', at: 0 }, []), null)
  assert.equal(keptPlace(null, []), null)
})

test('a sideways swipe moves; a scroll that drifted does not', () => {
  // The threshold is what stops a vertical scroll through a grid registering
  // as a move. A real swipe travels much further across than down.
  assert.equal(swipedTo(-120, 10), 1)
  assert.equal(swipedTo(120, -10), -1)
  // Far enough, but mostly downward: a scroll.
  assert.equal(swipedTo(-60, 90), 0)
  // Sideways, but barely: a tap that wobbled.
  assert.equal(swipedTo(-(SWIPE_MIN - 1), 0), 0)
  assert.equal(swipedTo(NaN, 0), 0)
})

test('and it says where you are in the set', () => {
  assert.equal(saidAs(0, 59), '1 of 59')
  assert.equal(saidAs(58, 59), '59 of 59')
  assert.equal(saidAs(0, 0), '')
})
