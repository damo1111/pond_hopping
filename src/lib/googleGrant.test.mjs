import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LEAST_USEFUL_SECONDS, usable, withdrawn, worthKeeping } from './googleGrant.js'

test('only a session that actually carries a refresh token is worth sending', () => {
  // onAuthStateChange fires for ordinary token refreshes, and those sessions
  // carry no provider fields at all. Without this it is a request per
  // refresh, all of them empty — and a server that overwrote a good grant
  // with nothing would break the very thing this exists to fix.
  assert.equal(worthKeeping({ provider_refresh_token: '1//0eXampleRefreshToken' }), true)
  assert.equal(worthKeeping({ provider_token: 'ya29.access-only' }), false)
  assert.equal(worthKeeping({}), false)
  assert.equal(worthKeeping(null), false)
  assert.equal(worthKeeping({ provider_refresh_token: '' }), false)
  assert.equal(worthKeeping({ provider_refresh_token: 'short' }), false)
})

test('an access token about to expire is not an access token', () => {
  // Handing forty seconds of token to a thousand-photograph import
  // guarantees a failure a minute later that looks like a scope problem —
  // which is the diagnosis this area has already produced wrongly twice.
  assert.equal(usable({ access_token: 'ya29.good', expires_in: 3599 }), 'ya29.good')
  assert.equal(usable({ access_token: 'ya29.dying', expires_in: 40 }), null)
  assert.equal(usable({ access_token: 'ya29.edge', expires_in: LEAST_USEFUL_SECONDS }), 'ya29.edge')
  // No expiry quoted is not a reason to refuse a token — Google does not
  // always say, and a token in hand beats a consent screen.
  assert.equal(usable({ access_token: 'ya29.quiet' }), 'ya29.quiet')
  assert.equal(usable({ error: 'not connected' }), null)
  assert.equal(usable(null), null)
})

test('withdrawn is told apart from Google having a bad minute', () => {
  // The distinction is the whole point. A withdrawn grant must be said out
  // loud — "connect it again" — and a network failure must not be, because
  // sending somebody to a consent screen they do not need is how this
  // feature became two taps in the first place.
  assert.equal(withdrawn({ error: 'invalid_grant' }), true)
  assert.equal(withdrawn({ error: 'revoked' }), true)
  assert.equal(withdrawn({ error: 'google would not swap it' }), false)
  assert.equal(withdrawn({ error: 'not configured' }), false)
  // Never connected is a 404 and is the ordinary case, not a withdrawal.
  assert.equal(withdrawn({ error: 'not connected' }, 404), false)
  assert.equal(withdrawn(null), false)
})
