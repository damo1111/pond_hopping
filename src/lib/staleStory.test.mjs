import { test } from 'node:test'
import assert from 'node:assert/strict'
import { builtFrom, isStale, sweep } from './staleStory.js'

const day = (date, n, stops = 2, latest = '2024-01-23T18:00:00Z') => ({
  date,
  photos: Array.from({ length: n }, (_, i) => ({ id: i, taken_at: i === n - 1 ? latest : '2024-01-23T09:00:00Z' })),
  stops: Array.from({ length: stops }, () => ({})),
})

test('what a day was built from is a count and a high-water mark', () => {
  const b = builtFrom(day('2024-01-23', 3))
  assert.equal(b.photos, 3)
  assert.equal(b.stops, 2)
  assert.equal(b.latest, '2024-01-23T18:00:00Z')
})

test('nothing added means nothing to redo', () => {
  const d = day('2024-01-23', 3)
  assert.equal(isStale({ built_from: builtFrom(d) }, d), false)
})

test('more photographs on a day makes its story out of date', () => {
  const before = day('2024-01-23', 3)
  const after = day('2024-01-23', 40, 5, '2024-01-23T21:00:00Z')
  assert.equal(isStale({ built_from: builtFrom(before) }, after), true)
})

test('and so does the same count landing on different stops', () => {
  // Forty photographs replaced by forty others, clustering differently.
  const before = day('2024-01-23', 3, 2)
  const after = day('2024-01-23', 3, 4)
  assert.equal(isStale({ built_from: builtFrom(before) }, after), true)
})

test('a day somebody wrote themselves is never touched', () => {
  // No built_from: this entry did not come from photographs at all.
  assert.equal(isStale({ built_from: null }, day('2024-01-23', 40)), false)
  assert.equal(isStale({}, day('2024-01-23', 40)), false)
})

test('and neither is one that has been edited by hand', () => {
  // The rule the whole feature stands on. Reconstructed, genuinely stale,
  // and still left alone — because somebody has since made it theirs.
  const before = day('2024-01-23', 3)
  const after = day('2024-01-23', 40, 5)
  const entry = { built_from: builtFrom(before), edited_at: '2024-02-01T10:00:00Z' }
  assert.equal(isStale(entry, after), false)
})

test('a sweep sorts days into never-written, out-of-date, and leave alone', () => {
  const days = [day('2024-01-22', 3), day('2024-01-23', 40, 5), day('2024-01-24', 3)]
  const entries = [
    // 23rd: ours, and the photographs have moved on.
    { entry_date: '2024-01-23', built_from: builtFrom(day('2024-01-23', 3)) },
    // 24th: ours and still accurate.
    { entry_date: '2024-01-24', built_from: builtFrom(day('2024-01-24', 3)) },
    // 22nd: no entry, so it lands in fresh.
  ]
  const { fresh, stale, leave } = sweep(days, entries)
  assert.deepEqual(fresh.map((d) => d.date), ['2024-01-22'])
  assert.deepEqual(stale.map((d) => d.date), ['2024-01-23'])
  assert.deepEqual(leave.map((d) => d.date), ['2024-01-24'])
})

test('a trip nobody has written up is all fresh and nothing else', () => {
  const { fresh, stale, leave } = sweep([day('2024-01-22', 3)], [])
  assert.equal(fresh.length, 1)
  assert.equal(stale.length, 0)
  assert.equal(leave.length, 0)
})

test('an edited day never appears in stale, however much changed', () => {
  const days = [day('2024-01-23', 400, 30)]
  const entries = [{ entry_date: '2024-01-23', built_from: builtFrom(day('2024-01-23', 1, 1)), edited_at: 'x' }]
  assert.deepEqual(sweep(days, entries).stale, [])
  assert.equal(sweep(days, entries).leave.length, 1)
})
