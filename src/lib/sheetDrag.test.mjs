import { test } from 'node:test'
import assert from 'node:assert/strict'
import { beginDrag, extendDrag, finishDrag, resistance, CLOSE_AT } from './sheetDrag.js'

const start = (y = 100, t = 0) => beginDrag({ y, t, inBody: false, scrollTop: 0 })

test('a pull from the bar past the threshold closes', () => {
  let s = start()
  let drag
  for (let i = 1; i <= 6; i++) ({ state: s, drag } = extendDrag(s, { y: 100 + i * 25, t: i * 16 }))
  assert.equal(drag > 0, true)
  assert.equal(finishDrag(s, 250), 'close')
})

test('a short, unhurried pull springs back', () => {
  let s = start()
  // 30px over 200ms — deliberate, and nowhere near the close distance.
  ;({ state: s } = extendDrag(s, { y: 130, t: 200 }))
  assert.equal(finishDrag(s, 130), 'spring')
})

// Velocity over a single frame is noisy: 30px in one 16ms frame is nearly
// 2 px/ms. Without a distance floor that twitch closes the sheet.
test('a fast twitch too short to mean anything does not close', () => {
  let s = start()
  ;({ state: s } = extendDrag(s, { y: 130, t: 16 }))
  assert.equal(finishDrag(s, 130), 'spring')
})

// The bug that survived three fixes. Android's WebView takes the gesture and
// fires touchcancel mid-pull; the old code threw the drag away and sprang
// back, so a deliberate haul down the sheet did nothing.
test('a cancel part-way through a long pull still closes', () => {
  let s = start()
  for (let i = 1; i <= 6; i++) ({ state: s } = extendDrag(s, { y: 100 + i * 25, t: i * 16 }))
  // touchcancel carries no coordinate at all.
  assert.equal(finishDrag(s, undefined), 'close')
})

test('a cancel part-way through a *short* pull springs back rather than closing', () => {
  let s = start()
  ;({ state: s } = extendDrag(s, { y: 124, t: 200 }))
  assert.equal(finishDrag(s, undefined), 'spring')
})

// The belt to the braces: an engine that swallows every move still delivers a
// final position. Not expressible through synthetic touch input — a real
// finger that travels always generates moves — so it is tested here.
test('no moves observed at all, but the finger plainly travelled → closes', () => {
  const s = start(100, 0)
  assert.equal(s.claimed, false)
  assert.equal(finishDrag(s, 320), 'close')
})

test('no moves and no travel is a tap, and a tap never closes', () => {
  const s = start(100, 0)
  assert.equal(finishDrag(s, 102), 'ignore')
  assert.equal(finishDrag(s, undefined), 'ignore')
})

test('a fast flick closes even under the distance threshold', () => {
  let s = start(100, 0)
  // 80px in 20ms — past the flick floor, well over the speed, under CLOSE_AT.
  ;({ state: s } = extendDrag(s, { y: 180, t: 20 }))
  assert.ok(80 < CLOSE_AT)
  assert.equal(finishDrag(s, 180), 'close')
})

test('a slow drag of the same distance springs back', () => {
  let s = start(100, 0)
  ;({ state: s } = extendDrag(s, { y: 180, t: 900 }))
  assert.equal(finishDrag(s, 180), 'spring')
})

test('an upward move releases the gesture to the list', () => {
  let s = start()
  const r = extendDrag(s, { y: 60, t: 16 })
  assert.equal(r.state, null)
  assert.equal(r.mine, false)
})

// This used to also assert r.state === null — that ending the gesture was the
// right response to an upward move. It is not: a thumb that overshoots and
// comes back should be able to carry on pulling, and the same rule was what
// discarded the gesture on a settling jitter. Resting is right; ending is not.
test('an upward move after a claimed pull resets the sheet to rest', () => {
  let s = start()
  ;({ state: s } = extendDrag(s, { y: 140, t: 16 }))
  const r = extendDrag(s, { y: 90, t: 32 })
  assert.equal(r.drag, 0)
  assert.notEqual(r.state, null)
})

test('movement under the slop is not yet a pull', () => {
  const s = start()
  const r = extendDrag(s, { y: 103, t: 8 })
  assert.equal(r.mine, false)
  assert.equal(r.drag, null)
  assert.equal(r.state.claimed, false)
})

test('a drag starting inside an already-scrolled list is not ours', () => {
  assert.equal(beginDrag({ y: 100, t: 0, inBody: true, scrollTop: 220 }), null)
})

test('a drag starting inside a list that is at the top is ours', () => {
  assert.notEqual(beginDrag({ y: 100, t: 0, inBody: true, scrollTop: 0 }), null)
})

test('dy remembers the furthest point, not the last one', () => {
  let s = start()
  ;({ state: s } = extendDrag(s, { y: 260, t: 16 }))
  ;({ state: s } = extendDrag(s, { y: 200, t: 32 }))
  assert.equal(s.dy, 160)
})

test('resistance follows the finger, then stiffens', () => {
  assert.equal(resistance(40), 40)
  assert.equal(resistance(CLOSE_AT), CLOSE_AT)
  assert.ok(resistance(CLOSE_AT + 100) < CLOSE_AT + 100)
  assert.ok(resistance(CLOSE_AT + 100) > CLOSE_AT)
})

test('finishing a gesture that never began is ignored, not a crash', () => {
  assert.equal(finishDrag(null, 400), 'ignore')
  assert.equal(finishDrag(undefined, undefined), 'ignore')
})

// ── The one that mattered ────────────────────────────────────────────────
//
// Every synthetic drag in the browser tests is perfectly monotonic, so none
// of them ever produced the thing a real thumb does constantly: a stray
// upward pixel as it presses down, before the pull begins. That used to
// destroy the gesture outright and no amount of dragging afterwards could
// bring it back.

test('a stray upward pixel before the pull does not kill the gesture', () => {
  let s = start(200, 0)
  // The thumb settles: 2px up.
  let r = extendDrag(s, { y: 198, t: 10 })
  assert.notEqual(r.state, null, 'gesture was discarded on a 2px jitter')
  s = r.state
  // Then the actual pull.
  for (let i = 1; i <= 6; i++) ({ state: s } = extendDrag(s, { y: 200 + i * 30, t: 10 + i * 16 }))
  assert.equal(finishDrag(s, 380), 'close')
})

test('several pixels of settle in both directions still survive', () => {
  let s = start(200, 0)
  for (const y of [199, 201, 198, 202, 200]) {
    const r = extendDrag(s, { y, t: 8 })
    assert.notEqual(r.state, null, `discarded at y=${y}`)
    s = r.state
  }
  for (let i = 1; i <= 6; i++) ({ state: s } = extendDrag(s, { y: 200 + i * 30, t: 8 + i * 16 }))
  assert.equal(finishDrag(s, 380), 'close')
})

test('a deliberate upward move still releases the gesture to the list', () => {
  const s = start(200, 0)
  const r = extendDrag(s, { y: 160, t: 16 })
  assert.equal(r.state, null)
  assert.equal(r.mine, false)
})

test('dragging back up after claiming holds at rest and stays draggable', () => {
  let s = start(200, 0)
  ;({ state: s } = extendDrag(s, { y: 260, t: 16 }))
  const back = extendDrag(s, { y: 190, t: 32 })
  assert.equal(back.drag, 0)
  assert.notEqual(back.state, null, 'lifting back up should not end the gesture')
  // ...and pulling down again still closes.
  let s2 = back.state
  ;({ state: s2 } = extendDrag(s2, { y: 340, t: 48 }))
  assert.equal(finishDrag(s2, 340), 'close')
})
