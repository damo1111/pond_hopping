import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { begin, busy, reset, whenIdle } from './busy.js'

beforeEach(reset)

test('nothing in flight is not busy', () => {
  assert.equal(busy(), false)
})

test('work in flight is busy until it ends', () => {
  const end = begin()
  assert.equal(busy(), true)
  end()
  assert.equal(busy(), false)
})

test('two uploads at once, and the first finishing is not the end of it', () => {
  // The actual case: several photographs ingesting concurrently. Going idle
  // when the first one lands would reload on top of the rest.
  const a = begin()
  const b = begin()
  a()
  assert.equal(busy(), true)
  b()
  assert.equal(busy(), false)
})

test('ending twice cannot make the app permanently busy', () => {
  // A finally that runs twice driving the count negative would leave every
  // later reload blocked forever — worse than the bug this exists to fix.
  const end = begin()
  end()
  end()
  assert.equal(busy(), false)
  const other = begin()
  assert.equal(busy(), true)
  other()
  assert.equal(busy(), false)
})

test('waiting on an idle app calls back at once', () => {
  let called = 0
  whenIdle(() => (called += 1))
  assert.equal(called, 1)
})

test('waiting on a busy app calls back when the work finishes', () => {
  const end = begin()
  let called = 0
  whenIdle(() => (called += 1))
  assert.equal(called, 0)
  end()
  assert.equal(called, 1)
})

test('every waiter hears about it, once', () => {
  const end = begin()
  let a = 0
  let b = 0
  whenIdle(() => (a += 1))
  whenIdle(() => (b += 1))
  end()
  assert.equal(a, 1)
  assert.equal(b, 1)

  // And the queue is empty afterwards, so the next piece of work does not
  // re-fire stale listeners.
  const again = begin()
  again()
  assert.equal(a, 1)
  assert.equal(b, 1)
})

test('unsubscribing means never hearing about it', () => {
  const end = begin()
  let called = 0
  const off = whenIdle(() => (called += 1))
  off()
  end()
  assert.equal(called, 0)
})

test('a listener that starts new work does not corrupt the queue', () => {
  const end = begin()
  let inner = null
  whenIdle(() => {
    inner = begin()
  })
  end()
  assert.equal(busy(), true)
  inner()
  assert.equal(busy(), false)
})
