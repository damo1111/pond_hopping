import { test } from 'node:test'
import assert from 'node:assert/strict'
import { remember, waiting, forget, CODE_GOOD_FOR_MS } from './pendingCode.js'

const store = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    size: () => m.size,
  }
}

test('nothing outstanding to begin with', () => {
  assert.equal(waiting(store()), null)
})

// The whole point: the step survives the trip to the mail app.
test('a code sent is still outstanding when you come back', () => {
  const s = store()
  remember('sam@example.com', s, 1000)
  assert.deepEqual(waiting(s, 1000 + 4 * 60 * 1000), { email: 'sam@example.com', at: 1000 })
})

test('it stops being outstanding once the code cannot work any more', () => {
  const s = store()
  remember('sam@example.com', s, 0)
  assert.equal(waiting(s, CODE_GOOD_FOR_MS + 1), null)
  // and it is cleared rather than left to be re-read
  assert.equal(s.size(), 0)
})

test('right up to the edge it is still good', () => {
  const s = store()
  remember('sam@example.com', s, 0)
  assert.ok(waiting(s, CODE_GOOD_FOR_MS))
})

// A device whose clock was wrong and has just been corrected backwards would
// otherwise make a code sent seconds ago look like it arrived in the future.
test('a clock that jumps backwards does not resurrect or destroy the step', () => {
  const s = store()
  remember('sam@example.com', s, 10_000)
  assert.equal(waiting(s, 9_000), null)
})

test('signing in forgets it', () => {
  const s = store()
  remember('sam@example.com', s, 0)
  forget(s)
  assert.equal(waiting(s, 0), null)
})

// A half-remembered step is worse than none — it would show a code box with
// no address on it, and nobody knows which inbox to go and look in.
test('junk in storage is treated as nothing outstanding, and cleared', () => {
  for (const junk of ['not json', '{}', 'null', '{"email":""}', '{"at":5}', '[]']) {
    const s = store()
    s.setItem('pond:code_sent', junk)
    assert.equal(waiting(s, 0), null, junk)
    assert.equal(s.size(), 0, junk)
  }
})

test('an empty address is never remembered', () => {
  const s = store()
  remember('', s, 0)
  assert.equal(waiting(s, 0), null)
})

// Storage switched off in private browsing must not take sign-in down with
// it — every function no-ops and the flow is exactly what it was before.
test('no storage at all is survivable', () => {
  assert.doesNotThrow(() => remember('sam@example.com', null, 0))
  assert.equal(waiting(null, 0), null)
  assert.doesNotThrow(() => forget(null))
})

test('a storage that throws on write does not throw at the caller', () => {
  const angry = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceeded') },
    removeItem: () => { throw new Error('nope') },
  }
  assert.doesNotThrow(() => remember('sam@example.com', angry, 0))
  assert.doesNotThrow(() => forget(angry))
})
