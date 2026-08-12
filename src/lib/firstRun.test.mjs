import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IN_ORDER, ONCE, bringOldFlagsOver, markSeen, nextUp, seen } from './firstRun.js'

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
  assert.equal(seen(ONCE.whose_trip, s), false)
})

test('one interruption at a time — the whole point of it', () => {
  const s = store()
  // A brand new hopper is owed two things. They meet one.
  assert.equal(nextUp(s), ONCE.cold_open)
  markSeen(ONCE.cold_open, s)
  // Not both in eight seconds, which is what four uncoordinated flags did.
  assert.equal(nextUp(s), ONCE.whose_trip)
  markSeen(ONCE.whose_trip, s)
  assert.equal(nextUp(s), null)
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
  // They never saw the tour, so the line about whose trip it is still owed.
  assert.equal(nextUp(s), ONCE.whose_trip)
})

test('finishing the old tour carries over as having been told whose trip it is', () => {
  const s = store({ 'pond:tourdone': '1' })
  bringOldFlagsOver(s)
  assert.equal(seen(ONCE.whose_trip, s), true)
  // Finishing the tour meant having got past the opening to reach it, so
  // there is now nothing left to show somebody who did.
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
test('the retired pitch card is not owed to anybody', () => {
  assert.equal(ONCE.pitch, undefined)
  assert.ok(!IN_ORDER.includes('pitch'))
  const old = store({ 'pond:seen': JSON.stringify({ pitch: 'carried-over' }) })
  assert.equal(nextUp(old), ONCE.cold_open)
})

test('the order is the order somebody should meet them', () => {
  assert.deepEqual(IN_ORDER, [ONCE.cold_open, ONCE.whose_trip])
})
