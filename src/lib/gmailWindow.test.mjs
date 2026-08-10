import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOOKED_BEFORE_MONTHS, queryFor, windowFor } from './gmailWindow.js'

const ROME = { start_date: '2024-01-22', end_date: '2024-01-25' }

test('the window is around the trip, not around today', () => {
  // The bug: `newer_than:14m` meant Rome's booking emails, sent in late
  // 2023, were thirty months outside a fourteen-month search.
  const w = windowFor(ROME)
  assert.equal(w.after, '2023/01/22')
  assert.equal(w.before, '2024/02/04')
  assert.equal(w.query, 'after:2023/01/22 before:2024/02/04')
})

test('wide enough for something booked most of a year ahead', () => {
  assert.ok(BOOKED_BEFORE_MONTHS >= 9)
  const w = windowFor({ start_date: '2026-06-30', end_date: '2026-07-08' })
  assert.equal(w.after, '2025/06/30')
})

test('and it reaches past the end, for the receipts that arrive after', () => {
  assert.equal(windowFor({ start_date: '2024-01-22', end_date: '2024-01-25' }).before, '2024/02/04')
})

test('a one-day trip still has a window', () => {
  const w = windowFor({ start_date: '2026-08-10' })
  assert.equal(w.after, '2025/08/10')
  assert.equal(w.before, '2026/08/20')
})

test('a trip with no dates cannot be searched for', () => {
  assert.equal(windowFor({}), null)
  assert.equal(windowFor({ start_date: null }), null)
})

test('the query is dated first, so it is never a search of everything', () => {
  const q = queryFor(ROME)
  assert.ok(q.startsWith('after:2023/01/22 before:2024/02/04'))
  assert.match(q, /from:booking\.com/)
  assert.match(q, /subject:\(confirmation/)
})

test('and an undated trip falls back rather than searching all time', () => {
  const q = queryFor({})
  assert.ok(q.startsWith('newer_than:14m'))
})
