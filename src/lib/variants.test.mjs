import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ENOUGH_EACH, TESTS, enough, hashOf, howItLooks, pickVariant } from './variants.js'

test('the same person always sees the same thing', () => {
  const first = pickVariant('add_tile', 'session-abc')
  for (let i = 0; i < 20; i++) assert.equal(pickVariant('add_tile', 'session-abc').id, first.id)
})

test('people spread evenly across the arms', () => {
  const seen = {}
  for (let i = 0; i < 2000; i++) {
    const v = pickVariant('add_tile', `session-${i}`)
    seen[v.id] = (seen[v.id] ?? 0) + 1
  }
  const [a, b] = Object.values(seen)
  // Within a few per cent of half each. A hash that clumps would make the
  // whole exercise pointless and would look exactly like a real result.
  assert.ok(Math.abs(a - b) < 200, `${a} vs ${b}`)
})

test('two tests at once are two tests, not one test with four arms', () => {
  // If the same bucket fell out for both, somebody in arm one of the tile
  // test would always be in arm one of everything else, and neither result
  // would mean anything.
  const tests = { one: [{ id: 'a' }, { id: 'b' }], two: [{ id: 'a' }, { id: 'b' }] }
  let differ = 0
  for (let i = 0; i < 400; i++) {
    const who = `s${i}`
    if (pickVariant('one', who, tests).id !== pickVariant('two', who, tests).id) differ++
  }
  assert.ok(differ > 150 && differ < 250, `${differ} of 400 differed`)
})

test('a test with one arm is a test that is switched off', () => {
  const tests = { settled: [{ id: 'the-winner' }] }
  assert.equal(pickVariant('settled', 'anyone', tests).id, 'the-winner')
  assert.equal(pickVariant('settled', 'somebody-else', tests).id, 'the-winner')
  // And a test that does not exist hands back nothing rather than throwing
  // in the middle of a render.
  assert.equal(pickVariant('never-heard-of-it', 'anyone'), null)
})

test('both tile variants exist and say something different', () => {
  const [a, b] = TESTS.add_tile
  assert.ok(a.title && b.title && a.title !== b.title)
  // The planner is a USP, so at least one arm has to speak to a trip that
  // has not happened yet — "get your trips back" alone tells somebody with
  // a holiday booked that this is not for them.
  assert.ok(TESTS.add_tile.some((v) => /next one|going|plan/i.test(`${v.title} ${v.strap}`)))
})

test('it refuses to call a winner on four taps', () => {
  const early = howItLooks({ 'tip-it-in': { shown: 12, tapped: 5 }, 'trips-back': { shown: 11, tapped: 2 } })
  assert.equal(early.ready, false)
  assert.match(early.says, /not yet/)
  // 41% against 18% looks decisive and is twenty-three people.
  assert.equal(early.rows[0].rate, 41.7)

  const later = howItLooks({
    'tip-it-in': { shown: ENOUGH_EACH, tapped: 60 },
    'trips-back': { shown: ENOUGH_EACH, tapped: 90 },
  })
  assert.equal(later.ready, true)
  assert.equal(later.rows[0].id, 'trips-back')
  assert.match(later.says, /trips-back is ahead/)
})

test('enough() wants both arms, not one big one', () => {
  assert.equal(enough({ a: 5000 }), false)
  assert.equal(enough({ a: 5000, b: 3 }), false)
  assert.equal(enough({ a: ENOUGH_EACH, b: ENOUGH_EACH }), true)
})

test('the hash is stable, so buckets survive a deploy', () => {
  // Written down rather than described: if this ever changes, everybody is
  // silently reshuffled and the numbers collected so far become a mixture.
  assert.equal(hashOf(''), 0x811c9dc5)
  assert.equal(hashOf('add_tile:session-abc'), hashOf('add_tile:session-abc'))
  assert.notEqual(hashOf('a'), hashOf('b'))
})
