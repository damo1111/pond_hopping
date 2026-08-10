import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asAsked, confirmed, needsLooking, stillAsking, storyRow, theirWords, whatItCosts } from './storyRun.js'
import { clockIn } from './localTime.js'

const pic = (id, over = {}) => ({
  id,
  url: `https://x.supabase.co/storage/v1/object/public/photos/${id}.jpg`,
  taken_at: '2024-01-23T12:16:30Z',
  lat: 41.89703,
  lon: 12.49475,
  ...over,
})

test('a photograph is looked at once, ever', () => {
  const photos = [pic('a'), pic('b', { seen: { what: 'a wall' }, seen_detail: 'low' })]
  assert.deepEqual(needsLooking(photos, 'low').map((p) => p.id), ['a'])
})

test('but the second pass may look again at what was only seen cheaply', () => {
  const photos = [
    pic('a', { seen: { what: 'an awning' }, seen_detail: 'low' }),
    pic('b', { seen: { what: 'a menu' }, seen_detail: 'high' }),
  ]
  assert.deepEqual(needsLooking(photos, 'high').map((p) => p.id), ['a'])
})

test('receipts are not part of anybody holiday', () => {
  assert.deepEqual(needsLooking([pic('r', { kind: 'receipt' })], 'low'), [])
})

test('the second pass asks for more pixels', () => {
  const low = asAsked(pic('a'), 'low')
  const high = asAsked(pic('a'), 'high')
  assert.ok(low.url.includes('width=512'))
  assert.ok(high.url.includes('width=1024'))
})

test('the time goes as text, in the trip own clock', () => {
  // A vision model never sees EXIF, so this is the only way it arrives.
  const asked = asAsked(pic('a'), 'low', 'Europe/Rome', clockIn)
  assert.equal(asked.at, '13:16')
  assert.equal(asked.lat, 41.89703)
})

test('what a run costs, said before it starts', () => {
  const photos = [pic('a'), pic('b'), pic('c', { seen: { what: 'x' }, seen_detail: 'low' })]
  const cost = whatItCosts(photos, 'low')
  assert.equal(cost.looking, 2)
  assert.equal(cost.already, 1)
  assert.equal(cost.calls, 1)
})

test('a question is asked once, and a no is remembered', () => {
  const qs = [
    { asks: 'Was your flight delayed?', answered_at: null },
    { asks: 'Did you eat here?', answer: 'no', answered_at: '2026-08-11T00:00:00Z' },
  ]
  assert.equal(stillAsking(qs).length, 1)
})

test('only a yes becomes evidence', () => {
  // A no is not evidence of the opposite, it is the absence of evidence.
  // Sending it back would invite the writer to argue with it.
  const qs = [
    { asks: 'delayed?', answer: 'yes', on_date: '2024-01-22' },
    { asks: 'ate here?', answer: 'no' },
    { asks: 'this hotel?', answer: 'unsure' },
  ]
  assert.deepEqual(confirmed(qs), [{ on_date: '2024-01-22', is: 'delayed?' }])
})

test('their own words go over, and reconstructions never do', () => {
  const kept = theirWords([
    { entry_date: '2024-01-22', note: 'The Concorde Room.', built_from: null },
    { entry_date: '2024-01-23', note: 'Pieced together.', built_from: { photos: 4 } },
  ])
  assert.deepEqual(Object.keys(kept), ['2024-01-22'])
})

test('what comes back becomes one row, opening and closing kept', () => {
  const row = storyRow(
    { id: 't1' },
    { opening: 'Some trips feel long.', days: [{ date: '2024-01-22', title: 'To Rome', note: 'It began.' }], closing: 'Three days.' },
    { days: [] }
  )
  assert.equal(row.opening, 'Some trips feel long.')
  assert.equal(row.chapters.length, 1)
  assert.equal(row.closing, 'Three days.')
  assert.equal(row.voice, 'narrator')
})
