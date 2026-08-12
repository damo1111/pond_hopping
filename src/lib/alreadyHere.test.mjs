import { test } from 'node:test'
import assert from 'node:assert/strict'
import { whatIsNew, fingerprintOf } from './alreadyHere.js'

const pick = (fingerprint, takenAt) => ({ fingerprint, takenAt })
const have = (fingerprint, taken_at) => ({ fingerprint, taken_at })

test('an empty trip takes everything', () => {
  const out = whatIsNew([pick('a'), pick('b')], [])
  assert.equal(out.fresh.length, 2)
  assert.equal(out.already, 0)
})

test('the same file twice is recognised and skipped', () => {
  const out = whatIsNew([pick('a'), pick('b')], [have('a')])
  assert.deepEqual(out.fresh.map((p) => p.fingerprint), ['b'])
  assert.equal(out.already, 1)
})

test('picking the whole roll again sends none of it', () => {
  const roll = ['a', 'b', 'c'].map((f) => pick(f))
  const out = whatIsNew(roll, roll.map((p) => have(p.fingerprint)))
  assert.equal(out.fresh.length, 0)
  assert.equal(out.already, 3)
})

// Everything uploaded before fingerprints existed has none, so without this
// the first retry after the change still sends all 262.
test('photos from before fingerprints are matched on when they were taken', () => {
  const out = whatIsNew(
    [pick(null, '2026-04-02T09:00:00Z'), pick(null, '2026-04-02T09:00:05Z')],
    [have(null, '2026-04-02T09:00:00Z')],
  )
  assert.deepEqual(out.fresh.map((p) => p.takenAt), ['2026-04-02T09:00:05Z'])
  assert.equal(out.already, 1)
})

// The one that makes this a counting problem rather than a matching one.
// EXIF is precise to the second and a burst is five shots in one second.
test('a burst is absorbed one for one, not all at once', () => {
  const burst = (n) => Array.from({ length: n }, () => pick(null, '2026-04-02T09:00:00Z'))
  const held = (n) => Array.from({ length: n }, () => have(null, '2026-04-02T09:00:00Z'))

  assert.equal(whatIsNew(burst(5), held(3)).fresh.length, 2, 'five offered, three held → two go')
  assert.equal(whatIsNew(burst(3), held(5)).fresh.length, 0, 'three offered, five held → none go')
  assert.equal(whatIsNew(burst(3), held(3)).fresh.length, 0, 'a clean retry sends nothing')
})

// Otherwise a photo caught by the fingerprint rule would also consume a
// timestamp slot it does not own, and a genuinely new burst shot slips past.
test('a fingerprint match does not also spend a second slot', () => {
  const out = whatIsNew(
    [pick('a', '2026-04-02T09:00:00Z'), pick(null, '2026-04-02T09:00:00Z')],
    [have('a', '2026-04-02T09:00:00Z'), have(null, '2026-04-02T09:00:00Z')],
  )
  assert.equal(out.already, 2)
  assert.equal(out.fresh.length, 0)
})

// The cost of asking twice is a duplicate. The cost of guessing wrong is a
// photograph that is never uploaded at all, so the doubt goes the other way.
test('a photo that cannot be recognised is always sent', () => {
  const out = whatIsNew([pick(null, null), pick(null, null)], [have(null, null)])
  assert.equal(out.fresh.length, 2)
  assert.equal(out.already, 0)
})

test('nothing picked is nothing to do', () => {
  assert.deepEqual(whatIsNew([], [have('a')]), { fresh: [], already: 0 })
  assert.deepEqual(whatIsNew(), { fresh: [], already: 0 })
})

test('a fingerprint is stable, and different files differ', async () => {
  const a = new TextEncoder().encode('the same bytes').buffer
  const b = new TextEncoder().encode('the same bytes').buffer
  const c = new TextEncoder().encode('other bytes').buffer
  assert.equal(await fingerprintOf(a, 100), await fingerprintOf(b, 100))
  assert.notEqual(await fingerprintOf(a, 100), await fingerprintOf(c, 100))
  // Same head, different length: a truncated copy is not the same file.
  assert.notEqual(await fingerprintOf(a, 100), await fingerprintOf(b, 101))
})

// An insecure origin has no crypto.subtle, and a photo with no fingerprint
// falls through to the timestamp rule rather than taking the upload down.
test('no digest available yields no fingerprint rather than an exception', async () => {
  const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  try {
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true })
    assert.equal(await fingerprintOf(new ArrayBuffer(4), 4), null)
    Object.defineProperty(globalThis, 'crypto', {
      value: { subtle: { digest: () => { throw new Error('not allowed here') } } },
      configurable: true,
    })
    assert.equal(await fingerprintOf(new ArrayBuffer(4), 4), null)
  } finally {
    if (real) Object.defineProperty(globalThis, 'crypto', real)
  }
})
