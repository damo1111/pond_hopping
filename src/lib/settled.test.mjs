import { test } from 'node:test'
import assert from 'node:assert/strict'
import { settled } from './settled.js'

// The button that sat on "one sec…" forever was waiting on a native call
// that never called back. These are about the guarantee that replaced it:
// whatever the platform does, the wait ends.

test('an answer that arrives is the answer', async () => {
  assert.deepEqual(await settled(Promise.resolve({ authorization: 'always' }), 50), {
    authorization: 'always',
  })
})

test('a call that never comes back gives up rather than hanging', async () => {
  assert.equal(await settled(new Promise(() => {}), 20), undefined)
})

test('a call that throws is no answer, not an explosion', async () => {
  // An older build without the plugin compiled in rejects immediately, and
  // that must not take the screen down with it.
  assert.equal(await settled(Promise.reject(new Error('no such plugin')), 50), undefined)
})

test('a slow answer still counts if it beats the clock', async () => {
  const slow = new Promise((r) => setTimeout(() => r('always'), 10))
  assert.equal(await settled(slow, 200), 'always')
})

test('a plain value is fine too', async () => {
  assert.equal(await settled('always', 50), 'always')
})
