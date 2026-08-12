import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withDeadline, TookTooLong, ONE_PHOTO_MS } from './deadline.js'

const soon = (v, ms = 1) => new Promise((r) => setTimeout(() => r(v), ms))
const never = () => new Promise(() => {})

test('work that finishes in time comes back as itself', async () => {
  assert.equal(await withDeadline(soon('done'), 200, 'a photo'), 'done')
})

// The whole point: a promise that never settles is not an error a catch can
// see, and a sequential loop stops on it for ever.
test('work that never settles becomes an error a caller can catch', async () => {
  await assert.rejects(() => withDeadline(never(), 20, 'a photo'), TookTooLong)
})

test('the error says what stalled and for how long', async () => {
  try {
    await withDeadline(never(), 20, 'photo 198')
    assert.fail('should have thrown')
  } catch (e) {
    assert.equal(e.what, 'photo 198')
    assert.equal(e.ms, 20)
    assert.match(e.message, /photo 198/)
  }
})

test('a rejection still rejects, with its own reason rather than a timeout', async () => {
  const boom = new Error('bad file')
  await assert.rejects(() => withDeadline(Promise.reject(boom), 200), (e) => e === boom)
})

test('a function is called rather than required to be a promise already', async () => {
  let started = false
  const out = await withDeadline(() => { started = true; return soon('ok') }, 200)
  assert.ok(started)
  assert.equal(out, 'ok')
})

// Otherwise every call would leave a pending timer, and a run of 262 photos
// would keep the process alive for a minute and a half after it finished.
test('the timer is cleared when the work wins', async () => {
  const before = process.getActiveResourcesInfo?.().filter((r) => r === 'Timeout').length ?? 0
  await withDeadline(soon('x'), 60_000)
  const after = process.getActiveResourcesInfo?.().filter((r) => r === 'Timeout').length ?? 0
  assert.ok(after <= before, `${before} → ${after}`)
})

test('no deadline at all is allowed, and waits', async () => {
  assert.equal(await withDeadline(soon('x'), 0), 'x')
  assert.equal(await withDeadline(soon('x'), null), 'x')
})

// Minutes of headroom for a couple of hundred kilobytes: this is here to
// catch never, not to catch slow.
test('the photo budget is generous', () => {
  assert.ok(ONE_PHOTO_MS >= 60_000, 'a bad connection must not trip it')
})
