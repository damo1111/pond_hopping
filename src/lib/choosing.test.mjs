import test from 'node:test'
import assert from 'node:assert/strict'
import {
  allOf, askingToRemove, everyOneChosen, inChunks, PER_REQUEST,
  stillVisible, toggle, whatWentThrough,
} from './choosing.js'

const grid = (...ids) => ids.map((id) => ({ id }))

test('tapping a tile picks it, tapping again puts it back', () => {
  let chosen = new Set()
  chosen = toggle(chosen, 'a')
  assert.deepEqual([...chosen], ['a'])
  chosen = toggle(chosen, 'b')
  assert.deepEqual([...chosen].sort(), ['a', 'b'])
  chosen = toggle(chosen, 'a')
  assert.deepEqual([...chosen], ['b'])
})

test('and the old selection is never mutated underneath React', () => {
  const before = new Set(['a'])
  const after = toggle(before, 'b')
  assert.deepEqual([...before], ['a'], 'the one React is holding is untouched')
  assert.notEqual(before, after)
})

test('“all” means what is on screen, not everything that exists', () => {
  // The tab filters by day and by highlights. Selecting nine hundred rows
  // because somebody pressed All while looking at twelve is help nobody
  // asked for, and it cannot be undone.
  assert.deepEqual([...allOf(grid('a', 'b', 'c'))].sort(), ['a', 'b', 'c'])
  assert.deepEqual([...allOf([])], [])
})

test('the one control knows whether it is All or None', () => {
  assert.equal(everyOneChosen(new Set(['a', 'b']), grid('a', 'b')), true)
  assert.equal(everyOneChosen(new Set(['a']), grid('a', 'b')), false)
  // Nothing on screen is not "all of it is chosen".
  assert.equal(everyOneChosen(new Set(['a']), []), false)
})

test('changing the filter drops what can no longer be seen', () => {
  // Otherwise a delete removes photographs the person is no longer looking
  // at, which they cannot check and did not mean.
  const kept = stillVisible(new Set(['a', 'b', 'c']), grid('b', 'c', 'd'))
  assert.deepEqual([...kept].sort(), ['b', 'c'])
  assert.deepEqual([...stillVisible(new Set(['a']), [])], [])
})

test('a big selection is cut into requests that will arrive', () => {
  // PostgREST puts `in.(…)` in the URL. A thousand uuids is about forty
  // kilobytes of query string — past what proxies carry, and it fails as a
  // malformed request rather than as anything that mentions length.
  const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
  const chunks = inChunks(ids)
  assert.equal(chunks.length, 3)
  assert.equal(chunks[0].length, PER_REQUEST)
  assert.equal(chunks[2].length, 50)
  assert.equal(chunks.flat().length, 250, 'nothing is lost in the cutting')
  assert.deepEqual(chunks.flat(), ids, 'and nothing is reordered')
})

test('and a silly chunk size cannot produce an infinite loop', () => {
  assert.equal(inChunks(['a', 'b'], 0).length, 2)
  assert.deepEqual(inChunks([], 10), [])
})

test('the question carries the number, because the number is the hesitation', () => {
  assert.equal(askingToRemove(1), 'Remove this photograph from the trip?')
  assert.equal(askingToRemove(12), 'Remove 12 photographs from the trip?')
  assert.match(askingToRemove(1200), /1,200 photographs/)
})

test('what was removed is counted from what came back, not from what was asked', () => {
  // A delete RLS declines returns no error and no rows. Trusting the request
  // would report nine hundred removed and put them all back on the next
  // load — the exact bug the single-photo path was written to avoid.
  const out = whatWentThrough([
    { data: [{ id: 'a' }, { id: 'b' }] },
    { data: [] },
    { error: { message: 'not yours to change' } },
  ])
  assert.equal(out.removed, 2, 'two rows came back, not three requests')
  assert.deepEqual(out.refused, ['not yours to change'])
})

test('and nothing coming back at all is nothing removed', () => {
  assert.deepEqual(whatWentThrough([]), { removed: 0, refused: [] })
  assert.equal(whatWentThrough([{ data: null }]).removed, 0)
})
