import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UNDATED, describeRow, newTripCount, planUpload, readyToUpload } from './photoPlan.js'

const trip = (id, title, start_date, end_date, extra = {}) => ({ id, title, start_date, end_date, ...extra })
const cluster = (start, end, count) => ({ start, end, count, photos: Array.from({ length: count }, (_, i) => i) })

const rome = trip('r', 'Rome', '2024-01-22', '2024-01-25')
const example = trip('rx', 'Rome', '2024-01-22', '2024-01-25', { is_demo: true })
const japan = trip('j', 'China & Japan', '2026-05-21', '2026-06-05')

test('a run inside one trip is settled, and says so', () => {
  const rows = planUpload({ clusters: [cluster('2024-01-23', '2024-01-24', 40)], trips: [rome, japan] })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].tripId, 'r')
  assert.equal(rows[0].unresolved, false)
  assert.equal(describeRow(rows[0], [rome]), '40 photos → Rome')
  assert.ok(readyToUpload(rows))
})

test('the example is not offered, so its twin does not make it a question', () => {
  // The whole reason routing skips demos: same dates, same title.
  const rows = planUpload({ clusters: [cluster('2024-01-23', '2024-01-24', 40)], trips: [rome, example] })
  assert.equal(rows[0].tripId, 'r')
  assert.equal(rows[0].unresolved, false)
})

test('two trips that both fit block the upload until somebody says which', () => {
  const overlapping = trip('w', 'Work in Italy', '2024-01-20', '2024-01-28')
  const rows = planUpload({ clusters: [cluster('2024-01-23', '2024-01-24', 12)], trips: [rome, overlapping] })
  assert.equal(rows[0].unresolved, true)
  assert.equal(rows[0].tripId, null)
  assert.equal(readyToUpload(rows), false)
})

test('choosing by hand settles the row and changes what it says', () => {
  const overlapping = trip('w', 'Work in Italy', '2024-01-20', '2024-01-28')
  const rows = planUpload({ clusters: [cluster('2024-01-23', '2024-01-24', 12)], trips: [rome, overlapping] })
  const settled = { ...rows[0], tripId: 'w', unresolved: false }
  assert.equal(describeRow(settled, [rome, overlapping]), '12 photos → Work in Italy')
  assert.ok(readyToUpload([settled]))
})

test('photos matching nothing become a new trip, counted before it happens', () => {
  const rows = planUpload({ clusters: [cluster('2025-09-01', '2025-09-04', 6)], trips: [rome] })
  assert.equal(rows[0].tripId, null)
  assert.equal(rows[0].unresolved, false) // a new trip is an answer, not a question
  assert.equal(newTripCount(rows), 1)
  assert.match(describeRow(rows[0], [rome]), /a new trip, 2025-09-01 to 2025-09-04/)
})

test('undated photos go where the person was already pointing, and say so', () => {
  const rows = planUpload({ clusters: [], undated: [1, 2, 3], trips: [rome], fallback: rome })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, UNDATED)
  assert.equal(rows[0].tripId, 'r')
  assert.equal(describeRow(rows[0], [rome]), '3 photos with no date in them → Rome')
  assert.ok(readyToUpload(rows))
})

test('undated photos with nowhere to go are a question, not a silent drop', () => {
  const rows = planUpload({ undated: [1, 2], trips: [rome], fallback: null })
  assert.equal(rows[0].unresolved, true)
  assert.equal(readyToUpload(rows), false)
  assert.match(describeRow(rows[0], [rome]), /nowhere yet/)
})

test('several runs are planned independently, and only the open question blocks', () => {
  const overlapping = trip('w', 'Work in Italy', '2024-01-20', '2024-01-28')
  const rows = planUpload({
    clusters: [cluster('2024-01-23', '2024-01-24', 40), cluster('2026-05-25', '2026-05-27', 9), cluster('2030-01-01', '2030-01-02', 2)],
    trips: [rome, overlapping, japan],
  })
  assert.deepEqual(rows.map((r) => r.tripId), [null, 'j', null])
  assert.deepEqual(rows.map((r) => r.unresolved), [true, false, false])
  assert.equal(newTripCount(rows), 1) // the 2030 run, not the unresolved one
  assert.equal(readyToUpload(rows), false)
})

test('nothing to upload is not ready to upload', () => {
  assert.equal(readyToUpload([]), false)
  assert.deepEqual(planUpload(), [])
  assert.equal(describeRow(null), '')
})
