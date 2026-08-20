import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenFromGrant } from './photoImport.js'

// This function had two bugs at once and had therefore never returned a
// token: the path was missing /api/, so the request went to a hostname that
// does not exist; and the Response object was handed to usable() instead of
// the JSON body, so even an answer that arrived produced null. Neither is
// visible from outside — the caller reads null as "not connected" and opens
// a consent screen, which is what it did every time.

const answer = (body, ok = true, status = 200) => ({
  ok,
  status,
  url: 'https://pond.eend.app/api/google-grant',
  json: async () => body,
})

test('the request goes to /api/, not to a bare name', async () => {
  const asked = []
  await tokenFromGrant({ ask: async (path) => { asked.push(path); return answer({ access_token: 'ya29.x', expires_in: 3599 }) } })
  assert.deepEqual(asked, ['/api/google-grant'])
})

test('and the token is read from the body, not off the Response', async () => {
  const token = await tokenFromGrant({ ask: async () => answer({ access_token: 'ya29.good', expires_in: 3599 }) })
  assert.equal(token, 'ya29.good')
})

test('never connected is null, and does not send anybody to a withdrawal message', async () => {
  // 404 is the ordinary case for somebody who has never connected Google.
  // Reporting it as a withdrawal would be a lie that costs a consent screen.
  const token = await tokenFromGrant({ ask: async () => answer({ error: 'not connected' }, false, 404) })
  assert.equal(token, null)
})

test('a withdrawn grant is said out loud', async () => {
  await assert.rejects(
    () => tokenFromGrant({ ask: async () => answer({ error: 'invalid_grant' }, false, 403) }),
    /withdrawn/
  )
})

test('and a token about to expire is not offered to a long import', async () => {
  const token = await tokenFromGrant({ ask: async () => answer({ access_token: 'ya29.dying', expires_in: 20 }) })
  assert.equal(token, null)
})
