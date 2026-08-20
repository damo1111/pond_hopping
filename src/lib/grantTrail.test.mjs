import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keepTheGrant } from './photoImport.js'

// Whichever way this ends, it must say so.
//
// It had three silent exits — no refresh token, the write failed, never
// called — and recorded nothing at any of them. So `google_grants` sat empty
// for a week and the reason was unknowable from outside: the same blank
// screen whether Google had refused, the network had, or the code had never
// run. These are the four sentences that tell those apart.

const trail = () => {
  const said = []
  return { said, say: (event, detail) => said.push([event, detail]) }
}
const names = (t) => t.said.map(([e]) => e)

test('an ordinary token refresh says nothing at all', async () => {
  // onAuthStateChange fires for every one of these. If they were recorded,
  // the handful that matter would be buried under thousands that do not —
  // which would make the log as useless as having none.
  const t = trail()
  assert.equal(await keepTheGrant({ access_token: 'refreshed' }, { say: t.say }), false)
  assert.equal(await keepTheGrant(null, { say: t.say }), false)
  assert.deepEqual(t.said, [])
})

test('coming back from Google is recorded whether or not it brought one', async () => {
  // google.js describes `google_landed` in a comment as the signature of a
  // redirect that never took. The event did not exist, so a departure with
  // no return looked exactly like a return that came back empty-handed.
  const t = trail()
  await keepTheGrant({ provider_token: 'ya29.access-only' }, { say: t.say })
  assert.deepEqual(names(t), ['google_landed', 'google_grant_absent'])
  assert.deepEqual(t.said[0][1], { refresh: 'no' })
})

test('and it says plainly when Google gave us no refresh token', async () => {
  // The single most useful line in this feature: it puts the fault upstream
  // of us, at what was asked for, rather than in the write.
  const t = trail()
  const kept = await keepTheGrant({ provider_token: 'ya29.x' }, {
    say: t.say,
    post: () => { throw new Error('must not be called') },
  })
  assert.equal(kept, false)
  assert.ok(names(t).includes('google_grant_absent'))
})

test('a grant that stores says so, and is only claimed once it has', async () => {
  const t = trail()
  const sent = []
  const kept = await keepTheGrant(
    { provider_refresh_token: '1//0eXampleRefreshToken', provider_scopes: 'photospicker' },
    { say: t.say, post: (path, opts) => { sent.push([path, opts.body.refresh_token]); return {} } }
  )
  assert.equal(kept, true)
  assert.deepEqual(names(t), ['google_landed', 'google_grant_kept'])
  assert.deepEqual(t.said[0][1], { refresh: 'yes' })
  assert.deepEqual(sent, [['/api/google-grant', '1//0eXampleRefreshToken']])
})

test('and a grant we held but could not store is a different sentence', async () => {
  // The distinction the whole change exists for. "Never given one" and "had
  // one and the write failed" need opposite fixes and looked identical.
  const t = trail()
  const kept = await keepTheGrant(
    { provider_refresh_token: '1//0eXampleRefreshToken' },
    { say: t.say, post: () => { throw new Error('500 service role missing') } }
  )
  assert.equal(kept, false)
  assert.deepEqual(names(t), ['google_landed', 'google_grant_refused'])
  assert.match(t.said[1][1].why, /service role/)
})
