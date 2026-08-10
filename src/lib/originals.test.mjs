import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mb, summarise } from './originals.js'

// The IndexedDB half is a thin wrapper with no decisions in it and no way
// to run here. What is worth pinning down is what the queue *says*, because
// that number is the only thing standing between somebody and quietly
// losing the originals they asked to keep.

test('an empty queue says nothing at all', () => {
  const s = summarise([])
  assert.equal(s.count, 0)
  assert.equal(s.bytes, 0)
  assert.equal(s.label, '')
  assert.deepEqual(summarise(), { count: 0, bytes: 0, label: '' })
})

test('one original is singular', () => {
  assert.match(summarise([{ bytes: 11 * 1024 * 1024 }]).label, /^1 original · /)
})

test('a real queue reads as a size somebody can act on', () => {
  const rows = Array.from({ length: 23 }, () => ({ bytes: 11 * 1024 * 1024 }))
  const s = summarise(rows)
  assert.equal(s.count, 23)
  assert.equal(s.label, '23 originals · 253 MB')
})

test('junk rows do not produce NaN in the one number that matters', () => {
  const s = summarise([{ bytes: 1024 * 1024 }, {}, { bytes: 'nonsense' }, null])
  assert.equal(s.count, 4)
  assert.equal(s.bytes, 1024 * 1024)
  assert.ok(!s.label.includes('NaN'))
})

test('sizes are rounded to something readable, and never to zero', () => {
  assert.equal(mb(0), '1 KB') // "0 KB" reads as nothing to do
  assert.equal(mb(400), '1 KB')
  assert.equal(mb(2 * 1024 * 1024), '2 MB')
  assert.equal(mb(2.4 * 1024 * 1024 * 1024), '2.4 GB')
  assert.equal(mb(undefined), '1 KB')
})
