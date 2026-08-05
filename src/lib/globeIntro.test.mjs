import test from 'node:test'
import assert from 'node:assert/strict'
import { INTRO, arcsShown, chronological, introDuration } from './globeIntro.js'

test('nothing is drawn during the held beat', () => {
  assert.equal(arcsShown(0, 148), 0)
  assert.equal(arcsShown(INTRO.holdMs, 148), 0)
})

test('the first arc appears as soon as drawing starts, not a fraction of one', () => {
  // Without the floor the eased curve rounds to 0 for the first few hundred
  // ms, so the globe would be visibly moving with nothing on it.
  const n = arcsShown(INTRO.holdMs + 1, 148)
  assert.equal(n, 1)
  assert.ok(Number.isInteger(n))
})

test('it always finishes on all of them', () => {
  assert.equal(arcsShown(introDuration(), 148), 148)
  assert.equal(arcsShown(99999, 148), 148)
})

test('never overshoots, never goes backwards', () => {
  let prev = 0
  for (let t = 0; t <= introDuration() + 400; t += 25) {
    const n = arcsShown(t, 148)
    assert.ok(n >= prev, `went backwards at ${t}ms: ${prev} → ${n}`)
    assert.ok(n <= 148, `overshot at ${t}ms: ${n}`)
    prev = n
  }
})

test('eased so the opening arcs land one at a time', () => {
  // A quarter of the way through, a linear ramp would already have dumped a
  // quarter of 148 routes on screen. The point is that you can follow the
  // first few.
  const quarter = arcsShown(INTRO.holdMs + INTRO.drawMs * 0.25, 148)
  assert.ok(quarter < 148 * 0.25, `expected fewer than 37 by a quarter in, got ${quarter}`)
  const half = arcsShown(INTRO.holdMs + INTRO.drawMs * 0.5, 148)
  assert.ok(half < 148 * 0.5, `expected fewer than 74 by half way, got ${half}`)
})

test('an empty history animates nothing rather than dividing by zero', () => {
  assert.equal(arcsShown(500, 0), 0)
  assert.equal(arcsShown(500, undefined), 0)
})

test('arcs are ordered by the first time each route was flown', () => {
  const arcs = [
    { id: 'c', flights: [{ dep_time: '2024-05-01T00:00:00Z' }] },
    { id: 'a', flights: [{ dep_time: '2008-01-01T00:00:00Z' }, { dep_time: '2019-01-01T00:00:00Z' }] },
    { id: 'b', flights: [{ dep_time: '2015-06-01T00:00:00Z' }] },
  ]
  assert.deepEqual(chronological(arcs).map((a) => a.id), ['a', 'b', 'c'])
})

test('routes with no usable date go last, not to 1970', () => {
  const arcs = [
    { id: 'undated', flights: [{ dep_time: null }] },
    { id: 'none', flights: [] },
    { id: 'dated', flights: [{ dep_time: '2020-01-01T00:00:00Z' }] },
  ]
  assert.equal(chronological(arcs)[0].id, 'dated')
  assert.equal(chronological(arcs).length, 3)
})

test('equal dates keep their original order, so nothing flickers between renders', () => {
  const same = '2020-01-01T00:00:00Z'
  const arcs = [
    { id: 'x', flights: [{ dep_time: same }] },
    { id: 'y', flights: [{ dep_time: same }] },
    { id: 'z', flights: [{ dep_time: same }] },
  ]
  assert.deepEqual(chronological(arcs).map((a) => a.id), ['x', 'y', 'z'])
  assert.deepEqual(chronological(chronological(arcs)).map((a) => a.id), ['x', 'y', 'z'])
})

test('sorting leaves the input alone', () => {
  const arcs = [
    { id: 'b', flights: [{ dep_time: '2020-01-01T00:00:00Z' }] },
    { id: 'a', flights: [{ dep_time: '2010-01-01T00:00:00Z' }] },
  ]
  chronological(arcs)
  assert.deepEqual(arcs.map((a) => a.id), ['b', 'a'])
})
