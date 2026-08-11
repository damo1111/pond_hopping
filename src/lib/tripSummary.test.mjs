import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsRewrite, summaryOf } from './tripSummary.js'

const STORY = { closing: 'What defined it was the walking, and where the walking kept taking me back to.' }
const CACHED = { summary: 'Rome was a short but lovely winter escape.', generated_at: '2026-08-11T00:00:00Z' }

test('the story tells the trip where there is one', () => {
  assert.deepEqual(summaryOf(STORY, CACHED), { text: STORY.closing, from: 'story' })
})

test('and the cached paragraph where there is not', () => {
  assert.deepEqual(summaryOf(null, CACHED), { text: CACHED.summary, from: 'cached' })
  assert.deepEqual(summaryOf({ closing: '   ' }, CACHED), { text: CACHED.summary, from: 'cached' })
})

test('a trip with neither says nothing rather than something empty', () => {
  assert.deepEqual(summaryOf(null, null), { text: null, from: null })
  assert.deepEqual(summaryOf({ closing: null }, { summary: '' }), { text: null, from: null })
})

test('nothing is generated for a trip nobody has written in', () => {
  assert.equal(needsRewrite({ hasEntries: false, cached: null }), false)
})

test('a trip with entries and no paragraph gets one', () => {
  assert.equal(needsRewrite({ hasEntries: true, cached: null }), true)
})

test('an edited day rewrites the cached paragraph', () => {
  assert.equal(
    needsRewrite({ hasEntries: true, cached: CACHED, newestEntry: '2026-08-11T02:00:00Z' }),
    true
  )
  assert.equal(
    needsRewrite({ hasEntries: true, cached: CACHED, newestEntry: '2026-08-10T00:00:00Z' }),
    false
  )
})

test('but never over the top of a story', () => {
  // The one that matters. The story is the better paragraph by a distance,
  // and a typo fixed in a journal entry must not replace it with the weaker
  // one written from the journal alone.
  assert.equal(
    needsRewrite({ hasEntries: true, story: STORY, cached: CACHED, newestEntry: '2026-08-11T02:00:00Z' }),
    false
  )
  assert.equal(needsRewrite({ hasEntries: true, story: STORY, cached: null }), false)
})
