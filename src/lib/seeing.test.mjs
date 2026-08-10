import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TOKENS, batches, costOf, foldInto, inParallel, merge, readingList } from './seeing.js'

const saw = (id, over = {}) => ({ id, what: 'a thing', subject: 'other', text: '', notable: '', ...over })

test('anything with writing in it is worth a second look', () => {
  // A half-read awning is the strongest possible sign the frame has a name
  // in it, and a name is what turns "somewhere near Via del Tritone" into
  // where somebody actually had lunch.
  const list = readingList([saw(1), saw(2, { text: 'TRATTORIA' }), saw(3)])
  assert.deepEqual(list, [2])
})

test('and so is anything that plausibly has writing, even where none was read', () => {
  // At 512 pixels an unreadable sign and no sign look the same, so the
  // subject has to stand in for the evidence.
  const list = readingList([saw(1, { subject: 'landscape' }), saw(2, { subject: 'interior' })])
  assert.deepEqual(list, [2])
})

test('the second list is capped, because it is the expensive one', () => {
  const many = Array.from({ length: 100 }, (_, i) => saw(i, { subject: 'food' }))
  assert.equal(readingList(many, { limit: 40 }).length, 40)
})

test('what a pass costs, before spending it', () => {
  // 286 photographs, the size of Rome. Nine times the price for the frames
  // that can actually be read is the whole argument for two passes.
  const cheap = costOf(286, 'low')
  const dear = costOf(286, 'high')
  assert.equal(cheap.images, 286 * TOKENS.low)
  assert.equal(cheap.calls, 15)
  assert.equal(dear.images / cheap.images, 9)
  // The instruction is a fixed 10,500 either way, which dilutes nine times
  // down to six and a half on the bill — 34,810 tokens against 229,290.
  assert.ok(dear.input / cheap.input > 6 && dear.input / cheap.input < 7)
})

test('a second look improves a field, and never blanks one', () => {
  // A high-detail read that comes back with no text where the cheap one
  // found some is a worse answer, not a newer one.
  const merged = merge(
    [saw(1, { text: 'TRATT...', what: 'a doorway' })],
    [{ id: 1, text: '', what: 'a doorway with an awning' }]
  )
  assert.equal(merged[0].text, 'TRATT...')
  assert.equal(merged[0].what, 'a doorway with an awning')
})

test('observations land beside the minute and the place', () => {
  const trace = {
    days: [{ date: '2024-01-23', trace: [{ id: 'a', at: '14:13', lat: 41.9, lon: 12.48 }, { id: 'b', at: '14:20', lat: 41.9, lon: 12.48 }] }],
  }
  const out = foldInto(trace, [saw('a', { what: 'carbonara', subject: 'food', text: 'Trattoria Melo' })])
  assert.equal(out.days[0].trace[0].what, 'carbonara')
  assert.equal(out.days[0].trace[0].text, 'Trattoria Melo')
  // Empty fields are dropped rather than sent as a hundred blank pairs.
  assert.equal('notable' in out.days[0].trace[0], false)
  // A photograph nobody looked at keeps its place in the day.
  assert.deepEqual(out.days[0].trace[1], { id: 'b', at: '14:20', lat: 41.9, lon: 12.48 })
})

test('photographs go over in groups small enough for one request', () => {
  assert.deepEqual(batches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})

test('batches run a few at a time, and come back in order', async () => {
  // Twenty-nine sequential calls to look at 286 photographs is minutes of
  // watching a line move. Nothing about them depends on anything else.
  const started = []
  const jobs = [1, 2, 3, 4, 5, 6].map((n) => async () => {
    started.push(n)
    await new Promise((r) => setTimeout(r, n === 1 ? 20 : 1))
    return n * 10
  })
  const out = await inParallel(jobs, 3)
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60])
  // Three were in flight before the first finished.
  assert.ok(started.slice(0, 3).length === 3)
})
