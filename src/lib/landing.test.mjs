import test from 'node:test'
import assert from 'node:assert/strict'
import { carryTo, findLanding, FLIGHT_MS, LANDING_SPOTS, receiveThe, RECEIVE_AT, waitForLanding } from './landing.js'

/** The smallest thing that answers querySelector the way a document does. */
const docWith = (...present) => ({
  querySelector: (sel) => (present.includes(sel) ? { sel } : null),
})

test('the demo trip is preferred, because it is the one being counted up', () => {
  const both = docWith('.wt-card--demo', '.wt-card')
  assert.equal(findLanding(both).sel, '.wt-card--demo')
})

test('and any trip card beats landing in mid-air', () => {
  assert.equal(findLanding(docWith('.wt-card')).sel, '.wt-card')
})

test('nothing to land on is null, not a throw', () => {
  assert.equal(findLanding(docWith()), null)
  assert.equal(findLanding(null), null)
  assert.equal(findLanding({}), null)
})

test('the order is the order, and is not accidental', () => {
  // The hero leads because the present is lifted out of the strip and is the
  // arrival; the strip cards follow, unchanged, for a home screen with no
  // present on it.
  assert.deepEqual(LANDING_SPOTS, ['.wt-front', '.wt-card--demo', '.wt-card'])
})

test('the transform matches centres, not corners', () => {
  // The two cards are different shapes — the opening's is tall, the World
  // tab's is wide — so matching corners would visibly slide it sideways as
  // it arrived.
  const from = { left: 100, top: 100, width: 200, height: 260 }
  const to = { left: 20, top: 500, width: 100, height: 80 }
  const got = carryTo(from, to)
  assert.equal(got.x, 20 + 50 - (100 + 100))
  assert.equal(got.y, 500 + 40 - (100 + 130))
  assert.equal(got.scale, 0.5)
})

test('a box with no width is refused rather than divided by', () => {
  // This is not a wrong animation. scale becomes Infinity and the screen
  // goes blank, silently, which is the worst way for it to fail.
  assert.equal(carryTo({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 10, height: 10 }), null)
  assert.equal(carryTo({ left: 0, top: 0, width: 10, height: 10 }, { left: 0, top: 0, width: 0, height: 0 }), null)
  assert.equal(carryTo(null, null), null)
})

test('a card that arrives late is still caught', async () => {
  // The original measured once, in the frame `leaving` flipped. WorldTab is
  // lazily loaded behind Suspense and its cards come from a query, so on a
  // cold start the target can be a hundred milliseconds away — and asking
  // once means asking too early and never asking again.
  let there = false
  setTimeout(() => { there = true }, 40)
  const root = { querySelector: (sel) => (there && sel === '.wt-card' ? { sel } : null) }
  const found = await waitForLanding(root, { within: 400 })
  assert.ok(found, 'it kept looking')
  assert.equal(found.sel, '.wt-card')
})

test('and one that never arrives gives up rather than hanging the ending', async () => {
  const never = { querySelector: () => null }
  const began = Date.now()
  const found = await waitForLanding(never, { within: 60 })
  assert.equal(found, null)
  assert.ok(Date.now() - began < 1000, 'it did not sit there')
})

test('a card already there is found immediately, with no wait at all', async () => {
  let ticks = 0
  const found = await waitForLanding(docWith('.wt-card--demo'), {
    within: 500,
    schedule: () => { ticks += 1 },
  })
  assert.equal(found.sel, '.wt-card--demo')
  assert.equal(ticks, 0, 'the common case must not cost a frame')
})

test('the card being landed on answers, without touching React’s className', () => {
  // WorldTab composes className itself and rewrites it wholesale on its next
  // render, so a class added from outside is removed at a moment nobody
  // controls. animate() touches nothing React owns.
  let played = null
  const ok = receiveThe({ animate: (frames, opts) => { played = { frames, opts } } })
  assert.equal(ok, true)
  assert.equal(played.opts.duration, 340)
  assert.equal(played.frames.length, 3)
  assert.equal(played.frames[0].transform, 'scale(1)')
  assert.equal(played.frames[2].transform, 'scale(1)', 'it ends where it started')
})

test('and an engine without animate gets the flight without the flourish', () => {
  assert.equal(receiveThe({}), false)
  assert.equal(receiveThe(null), false)
  assert.equal(receiveThe({ animate: () => { throw new Error('nope') } }), false)
})

test('the receive starts before the flight ends, so they overlap', () => {
  // Otherwise the destination reacts *after* arrival, which reads as two
  // layers rather than one object.
  assert.ok(RECEIVE_AT < FLIGHT_MS, `${RECEIVE_AT} must be inside ${FLIGHT_MS}`)
})

test('the opening lands on the hero, not on a card in the strip', () => {
  // Home was one strip of equal cards when this list was written. The
  // present is now lifted out of the strip into a full-width card above it —
  // and the heroed trip leaves the strip — so aiming at .wt-card--demo flew
  // the opening onto whatever small card was left in the row.
  const root = {
    querySelector: (q) =>
      ({ '.wt-front': { it: 'hero' }, '.wt-card--demo': { it: 'rome' }, '.wt-card': { it: 'any' } })[q] ?? null,
  }
  assert.deepEqual(findLanding(root), { it: 'hero' })
})

test('and falls back down the strip when there is no present', () => {
  // A home screen with nothing live and nothing within the week has no hero
  // at all, and a card is still a better landing than mid-air.
  const noHero = {
    querySelector: (q) => ({ '.wt-card--demo': { it: 'rome' }, '.wt-card': { it: 'any' } })[q] ?? null,
  }
  assert.deepEqual(findLanding(noHero), { it: 'rome' })
  const bare = { querySelector: (q) => (q === '.wt-card' ? { it: 'any' } : null) }
  assert.deepEqual(findLanding(bare), { it: 'any' })
  assert.equal(findLanding({ querySelector: () => null }), null)
})
