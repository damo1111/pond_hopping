import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consentUrl } from './consentUrl.js'

const answer = (body, ok = true) => ({
  ok,
  // A real Response has this, and reading it instead of the body is the bug.
  url: 'https://pond.eend.app/api/google-connect',
  json: async () => body,
})

test('the address comes from the body', async () => {
  const good = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x'
  assert.equal(await consentUrl(answer({ url: good })), good)
})

test('and never from the Response, which carries its own url', async () => {
  // The whole bug: said.url was our own endpoint, so the app navigated to
  // itself and the service worker served the app shell back. It looked like
  // a reload, with nothing logged anywhere.
  const res = answer({})
  assert.equal(await consentUrl(res), null)
  assert.notEqual(await consentUrl(res), res.url)
})

test('anything that is not a Google address is refused', async () => {
  // The guard that would have caught it regardless of where the value came
  // from. This is somewhere the app is about to navigate to.
  assert.equal(await consentUrl(answer({ url: 'https://pond.eend.app/api/google-connect' })), null)
  assert.equal(await consentUrl(answer({ url: '/api/google-connect' })), null)
  assert.equal(await consentUrl(answer({ url: 'https://accounts.google.com.evil.test/o' })), null)
  assert.equal(await consentUrl(answer({ url: 42 })), null)
})

test('a refusal or a body that is not JSON is null, not a throw', async () => {
  assert.equal(await consentUrl(answer({ url: 'https://accounts.google.com/o' }, false)), null)
  assert.equal(await consentUrl({ ok: true, json: async () => { throw new Error('not json') } }), null)
  assert.equal(await consentUrl(null), null)
  assert.equal(await consentUrl({ ok: true }), null)
})
