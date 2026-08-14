import { test } from 'node:test'
import assert from 'node:assert/strict'
import { finishSignIn, whatCameBack } from './backFromTheBrowser.js'

test('tokens in the fragment are recognised', () => {
  const said = whatCameBack('https://pond.eend.app/#access_token=abc&refresh_token=def&token_type=bearer')
  assert.equal(said.kind, 'tokens')
  assert.equal(said.access, 'abc')
  assert.equal(said.refresh, 'def')
})

test('a code in the query is recognised too', () => {
  // Which shape arrives is a client setting that could change under us.
  const said = whatCameBack('https://pond.eend.app/?code=xyz')
  assert.equal(said.kind, 'code')
  assert.equal(said.code, 'xyz')
})

test('somebody saying no is told apart from nothing happening', () => {
  // One is a refusal worth reporting; the other is an ordinary link.
  const said = whatCameBack('https://pond.eend.app/#error=access_denied&error_description=You%20said%20no')
  assert.equal(said.kind, 'refused')
  assert.equal(said.why, 'You said no')
})

test('an error with no description falls back to the code', () => {
  assert.equal(whatCameBack('https://pond.eend.app/#error=access_denied').why, 'access_denied')
})

test('an ordinary link carries nothing', () => {
  assert.equal(whatCameBack('https://pond.eend.app/').kind, 'nothing')
  assert.equal(whatCameBack('https://pond.eend.app/trip/rome').kind, 'nothing')
})

test('rubbish does not throw', () => {
  // This runs inside a native event handler with nobody to catch it.
  assert.equal(whatCameBack('not a url').kind, 'nothing')
  assert.equal(whatCameBack(null).kind, 'nothing')
  assert.equal(whatCameBack(undefined).kind, 'nothing')
  assert.equal(whatCameBack('').kind, 'nothing')
})

test('half a token is not a session', () => {
  // An access token with no refresh token would set a session that cannot
  // outlive the hour, which is worse than not signing in at all.
  assert.equal(whatCameBack('https://pond.eend.app/#access_token=abc').kind, 'nothing')
})

test('the tokens are handed to supabase-js as a session', async () => {
  let got = null
  const client = { auth: { setSession: async (a) => { got = a; return {} } } }
  const said = await finishSignIn('https://pond.eend.app/#access_token=a&refresh_token=r', { client })
  assert.equal(said.kind, 'signed in')
  assert.deepEqual(got, { access_token: 'a', refresh_token: 'r' })
})

test('a code is exchanged instead', async () => {
  let got = null
  const client = { auth: { exchangeCodeForSession: async (c) => { got = c; return {} } } }
  const said = await finishSignIn('https://pond.eend.app/?code=xyz', { client })
  assert.equal(said.kind, 'signed in')
  assert.equal(got, 'xyz')
})

test('a refusal from supabase-js is returned, not thrown', async () => {
  // The caller is a listener. An unhandled rejection in a native event
  // handler is invisible, and invisible is exactly what was wrong before.
  const client = { auth: { setSession: async () => ({ error: new Error('token expired') }) } }
  const said = await finishSignIn('https://pond.eend.app/#access_token=a&refresh_token=r', { client })
  assert.equal(said.kind, 'broken')
  assert.equal(said.why, 'token expired')
})

test('an ordinary deep link never touches the auth client', async () => {
  const client = {
    auth: {
      setSession: () => assert.fail('should not have been called'),
      exchangeCodeForSession: () => assert.fail('should not have been called'),
    },
  }
  assert.equal((await finishSignIn('https://pond.eend.app/trip/rome', { client })).kind, 'nothing')
})

test('Google’s own token is taken off the fragment too', () => {
  // Supabase returns provider_token beside access_token whenever the sign-in
  // asked for provider scopes, and setSession() knows nothing about it. Left
  // on the floor, consenting to the Photos scope ended with the app signed
  // in, the scope granted, and "401 not connected to Google yet" — said
  // immediately after Google had said yes.
  const said = whatCameBack(
    'app.eend.pond://auth#access_token=a&refresh_token=r&provider_token=ya29.google'
  )
  assert.equal(said.kind, 'tokens')
  assert.equal(said.provider, 'ya29.google')
})

test('and its absence is not an error — most sign-ins have no provider token', () => {
  const said = whatCameBack('app.eend.pond://auth#access_token=a&refresh_token=r')
  assert.equal(said.kind, 'tokens')
  assert.equal(said.provider, null)
})
