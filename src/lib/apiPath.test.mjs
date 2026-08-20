import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkedPath } from './apiPath.js'

// Wrapped in Capacitor, API_BASE is an origin with no trailing slash, so a
// bare name concatenates straight onto it: 'google-connect' became
// https://pond.eend.appgoogle-connect — a DNS failure, reported by WebKit as
// "Load failed". On the web the same bare name resolves relative to the
// current page and 404s. One mistake, two symptoms, which is how it survived
// on both platforms at once.

test('a proper path is returned unchanged', () => {
  assert.equal(checkedPath('/api/google-connect'), '/api/google-connect')
  assert.equal(checkedPath('/api/hotel-search?near=Rome'), '/api/hotel-search?near=Rome')
})

test('a bare name is refused rather than silently prefixed', () => {
  // Correcting it here would hide the next one. The path is wrong at the
  // call site and that is where it should be fixed.
  assert.throws(() => checkedPath('google-connect'), /\/api\//)
  assert.throws(() => checkedPath('google-grant'), /\/api\//)
})

test('and so is anything that is not a path at all', () => {
  assert.throws(() => checkedPath('/google-connect'), /\/api\//)
  assert.throws(() => checkedPath('https://pond.eend.app/api/x'), /\/api\//)
  assert.throws(() => checkedPath(null), /\/api\//)
  assert.throws(() => checkedPath(undefined), /\/api\//)
})

import { authHeader } from './apiPath.js'

test('a signed-in session becomes a Bearer header', () => {
  assert.deepEqual(authHeader({ access_token: 'eyJhbGciOi' }), { Authorization: 'Bearer eyJhbGciOi' })
})

test('and no session sends no header, rather than an empty Bearer', () => {
  // "Bearer " with nothing after it is a malformed credential and earns a
  // 401 for the wrong reason. No header is the honest "nobody is signed in".
  assert.deepEqual(authHeader(null), {})
  assert.deepEqual(authHeader({}), {})
  assert.deepEqual(authHeader({ access_token: '' }), {})
  assert.deepEqual(authHeader({ access_token: 7 }), {})
})
