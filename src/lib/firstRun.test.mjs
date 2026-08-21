import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  IN_ORDER,
  ONCE,
  bringOldFlagsOver,
  forceFirstRun,
  forcing,
  forget,
  markSeen,
  nextUp,
  seen,
} from './firstRun.js'

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

// ── ?first=… ──────────────────────────────────────────────────────────────

test('the URL can ask for the opening again', () => {
  const s = store({ 'pond:seen': JSON.stringify({ cold_open: 'x', demo_tour: 'x' }) })
  forceFirstRun('?first=opening', s)
  assert.equal(seen(ONCE.cold_open, s), false)
  assert.equal(seen(ONCE.demo_tour, s), true, 'only what was asked for')
  assert.equal(nextUp(s), ONCE.cold_open)
})

test('or the tour, or both', () => {
  const s = store({ 'pond:seen': JSON.stringify({ cold_open: 'x', demo_tour: 'x' }) })
  forceFirstRun('?first=all', s)
  assert.equal(seen(ONCE.cold_open, s), false)
  assert.equal(seen(ONCE.demo_tour, s), false)
})

test('and the words people actually type all work', () => {
  // intro/cold/tips/tooltips exist because they are what gets typed at 11pm.
  for (const w of ['opening', 'intro', 'cold', 'cold_open']) {
    assert.ok(forcing(`?first=${w}`).has(ONCE.cold_open), `${w} should mean the opening`)
  }
  for (const w of ['tour', 'tips', 'tooltips', 'demo_tour']) {
    assert.ok(forcing(`?first=${w}`).has(ONCE.demo_tour), `${w} should mean the tour`)
  }
})

test('a comma-separated pair asks for both', () => {
  const got = forcing('?first=opening,tour')
  assert.deepEqual([...got].sort(), [ONCE.cold_open, ONCE.demo_tour].sort())
})

test('none puts you back to being a returning hopper', () => {
  // The other half of the problem: having seen the opening once, there was
  // no way back to the ordinary launch either.
  const s = store()
  forceFirstRun('?first=none', s)
  assert.equal(seen(ONCE.cold_open, s), true)
  assert.equal(seen(ONCE.demo_tour, s), true)
  assert.equal(nextUp(s), null)
})

test('nonsense in the parameter is ignored, never thrown', () => {
  // Prove the check can fail: if unknown words fell through to forget(),
  // `?first=banana` would clear the record and replay the opening for real
  // hoppers who followed a mangled link.
  const s = store({ 'pond:seen': JSON.stringify({ cold_open: 'x' }) })
  assert.doesNotThrow(() => forceFirstRun('?first=banana', s))
  assert.equal(seen(ONCE.cold_open, s), true, 'an unknown word must change nothing')
  assert.equal(forcing('?first=').size, 0)
  assert.equal(forcing('').size, 0)
  assert.equal(forcing('?other=1').size, 0)
})

test('and no parameter at all touches nothing', () => {
  // The overwhelmingly common case: this runs on every single boot.
  const s = store({ 'pond:seen': JSON.stringify({ cold_open: 'x' }) })
  const before = s.box['pond:seen']
  forceFirstRun('', s)
  assert.equal(s.box['pond:seen'], before, 'an ordinary launch must not write')
})
