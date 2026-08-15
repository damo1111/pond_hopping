import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IN_ORDER, ONCE, bringOldFlagsOver, forget, markSeen, nextUp, seen } from './firstRun.js'

const store = (start = {}) => {
  const box = { ...start }
  return {
    getItem: (k) => (k in box ? box[k] : null),
    setItem: (k, v) => { box[k] = String(v) },
    box,
  }
}

test('nothing seen means the first thing in the order is owed', () => {
  const s = store()
  assert.equal(nextUp(s), ONCE.cold_open)
})

test('and once it has been met, nothing is owed', () => {
  const s = store()
  assert.equal(nextUp(s), ONCE.cold_open)
  markSeen(ONCE.cold_open, s)
  assert.equal(nextUp(s), null)
})

// The queue is down to one entry and it stays, because it is what stops the
// next thing anybody adds from arriving on top of the opening.
test('the queue still only ever offers one thing', () => {
  const s = store()
  const order = ['cold_open', 'something_new']
  assert.equal(nextUp(s, order), 'cold_open')
  markSeen('cold_open', s)
  assert.equal(nextUp(s, order), 'something_new')
})

test('it writes down when, not merely that', () => {
  const s = store()
  markSeen(ONCE.cold_open, s, () => new Date('2026-08-12T09:00:00Z'))
  assert.equal(JSON.parse(s.box['pond:seen']).cold_open, '2026-08-12T09:00:00.000Z')
})

test('storage that refuses to work shows things again rather than throwing', () => {
  const broken = {
    getItem() { throw new Error('nope') },
    setItem() { throw new Error('nope') },
  }
  assert.doesNotThrow(() => nextUp(broken))
  assert.equal(nextUp(broken), ONCE.cold_open)
  assert.doesNotThrow(() => markSeen(ONCE.cold_open, broken))
  // Rubbish in the key is the same case and must not take boot down with it.
  const junk = store({ 'pond:seen': 'not json at all' })
  assert.equal(nextUp(junk), ONCE.cold_open)
})

test('somebody who already sat through the old carousel is not shown it again', () => {
  const s = store({ 'pond:intro': '1' })
  bringOldFlagsOver(s)
  assert.equal(seen(ONCE.cold_open, s), true)
  assert.equal(nextUp(s), null)
})

test('and neither is somebody who finished the old tour', () => {
  const s = store({ 'pond:tourdone': '1' })
  bringOldFlagsOver(s)
  assert.equal(seen(ONCE.cold_open, s), true)
  assert.equal(nextUp(s), null)
})

test('carrying over is safe to run twice and leaves the old keys alone', () => {
  const s = store({ 'pond:intro': '1', 'pond:tourdone': '1' })
  bringOldFlagsOver(s)
  const after = { ...s.box }
  bringOldFlagsOver(s)
  assert.deepEqual(s.box, after)
  // Left where the old code would look for them, so a revert still works.
  assert.equal(s.box['pond:intro'], '1')
  assert.equal(s.box['pond:tourdone'], '1')
  assert.equal(nextUp(s), null)
})

// The card it used to gate is gone: the opening says what the app is for
// itself. A record still carrying `pitch` from before is left alone — it is
// simply never asked about — but nothing may put it back in the queue.
test('the retired cards are not owed to anybody', () => {
  assert.equal(ONCE.pitch, undefined)
  assert.equal(ONCE.whose_trip, undefined)
  assert.ok(!IN_ORDER.includes('pitch'))
  assert.ok(!IN_ORDER.includes('whose_trip'))
  const old = store({ 'pond:seen': JSON.stringify({ pitch: 'x', whose_trip: 'x' }) })
  assert.equal(nextUp(old), ONCE.cold_open, 'the opening is still owed to them')
})

test('the order is the order somebody should meet them', () => {
  assert.deepEqual(IN_ORDER, [ONCE.cold_open])
})

// The record was write-only until somebody wanted to watch the opening a
// second time. On Android that is not a nicety: a new build installs over
// the old one and the WebView keeps its storage, so cold_open is already
// stamped and the new build opens onto the app with no opening at all —
// indistinguishable from the animation being broken.
test('what has been seen can be unseen, so the opening can play again', () => {
  const s = store()
  markSeen(ONCE.cold_open, s)
  assert.equal(seen(ONCE.cold_open, s), true)
  assert.equal(nextUp(s), null, 'nothing owed while it is stamped')

  forget(ONCE.cold_open, s)

  assert.equal(seen(ONCE.cold_open, s), false)
  assert.equal(nextUp(s), ONCE.cold_open, 'owed again, so the next cold launch plays it')
})

test('and forgetting one thing leaves everything else alone', () => {
  // Deleted rather than written falsy, so the record only ever holds things
  // that genuinely happened and seen() stays a question about presence.
  const s = store({ 'pond:seen': JSON.stringify({ cold_open: 'x', something_else: 'y' }) })
  forget(ONCE.cold_open, s)
  const left = JSON.parse(s.box['pond:seen'])
  assert.deepEqual(left, { something_else: 'y' })
  assert.ok(!('cold_open' in left), 'removed, not set to false')
})

test('and storage that refuses the write does not take the app down', () => {
  const refuses = {
    getItem: () => JSON.stringify({ cold_open: 'x' }),
    setItem: () => { throw new Error('quota') },
  }
  assert.doesNotThrow(() => forget(ONCE.cold_open, refuses))
  assert.doesNotThrow(() => forget(ONCE.cold_open, undefined))
})
