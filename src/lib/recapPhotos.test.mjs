import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SHOWN, forRecap, nextTurn, rotating } from './recapPhotos.js'

const pic = (n, is_highlight = false) => ({
  id: n,
  is_highlight,
  taken_on: `2024-01-${String((n % 28) + 1).padStart(2, '0')}`,
})

const starred = (n) => Array.from({ length: n }, (_, i) => pic(i, true))

test('twelve stars are the twelve, whatever the turn', () => {
  const all = starred(SHOWN)
  assert.deepEqual(forRecap(all, 0).map((p) => p.id), all.map((p) => p.id))
  assert.deepEqual(forRecap(all, 7).map((p) => p.id).sort(), all.map((p) => p.id).sort())
})

test('thirty stars show twelve, and a different twelve next time', () => {
  const all = starred(30)
  const first = forRecap(all, 0).map((p) => p.id)
  const second = forRecap(all, 1).map((p) => p.id)
  assert.equal(first.length, SHOWN)
  assert.equal(second.length, SHOWN)
  assert.notDeepEqual(first, second)
})

test('and every one of them is shown eventually', () => {
  // The whole point of starring the thirteenth photograph.
  const all = starred(30)
  const seen = new Set()
  for (let turn = 0; turn < 30; turn++) for (const p of forRecap(all, turn)) seen.add(p.id)
  assert.equal(seen.size, 30)
})

test('the same turn is the same twelve', () => {
  // Two people opening the same shared link must see the same page, and it
  // must not reshuffle while somebody is looking at it.
  const all = starred(30)
  assert.deepEqual(forRecap(all, 4).map((p) => p.id), forRecap(all, 4).map((p) => p.id))
})

test('a window is read in order, not in the order it wrapped', () => {
  const all = starred(30)
  const dates = forRecap(all, 25).map((p) => p.taken_on)
  assert.deepEqual(dates, [...dates].sort())
})

test('two stars still fill the page from the rest', () => {
  const all = [...starred(2), ...Array.from({ length: 40 }, (_, i) => pic(100 + i))]
  const out = forRecap(all, 3)
  assert.equal(out.length, SHOWN)
  assert.equal(out.filter((p) => p.is_highlight).length, 2)
  // The unstarred do not rotate — the same ones every time.
  assert.deepEqual(forRecap(all, 9).map((p) => p.id), out.map((p) => p.id))
})

test('a trip with barely any photographs shows what it has', () => {
  const all = [pic(1), pic(2)]
  assert.equal(forRecap(all, 0).length, 2)
  assert.deepEqual(forRecap([], 0), [])
})

test('it says when there is more than fits', () => {
  assert.equal(rotating(starred(13)), true)
  assert.equal(rotating(starred(12)), false)
  assert.equal(rotating([pic(1), pic(2)]), false)
})

test('the counter advances per trip and survives a bad store', () => {
  const mem = new Map()
  const store = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
  }
  assert.equal(nextTurn('a', store), 1)
  assert.equal(nextTurn('a', store), 2)
  assert.equal(nextTurn('b', store), 1)
  assert.equal(nextTurn(null, store), 0)

  const broken = { getItem: () => 'not json', setItem: () => {} }
  assert.equal(nextTurn('a', broken), 0)
})
