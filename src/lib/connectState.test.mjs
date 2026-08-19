import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STATE_GOOD_FOR, opened, sealed } from './connectState.js'

const SECRET = 'a-shared-secret-for-the-test'
const UID = '11111111-2222-3333-4444-555555555555'

test('what goes to Google comes back saying who it was for', () => {
  const s = sealed({ uid: UID, back: '/photos' }, SECRET)
  const out = opened(s, SECRET)
  assert.equal(out.uid, UID)
  assert.equal(out.back, '/photos')
})

test('an edited state is refused', () => {
  // This is the whole reason it is signed. The callback arrives with no
  // Authorization header, so an unsigned state would let anybody write a
  // Google grant against any user id they typed into a URL — which is
  // somebody else's photographs, handed over by us.
  const s = sealed({ uid: UID }, SECRET)
  const [body, sig] = s.split('.')
  const theirs = Buffer.from(JSON.stringify({ uid: 'someone-else', exp: Date.now() + 60000 })).toString('base64url')
  assert.equal(opened(`${theirs}.${sig}`, SECRET), null)
  assert.equal(opened(`${body}.${'x'.repeat(sig.length)}`, SECRET), null)
})

test('and one signed with a different key is refused', () => {
  const s = sealed({ uid: UID }, 'some-other-secret')
  assert.equal(opened(s, SECRET), null)
})

test('it expires, so a URL left in a history is worthless later', () => {
  const at = 1_700_000_000_000
  const s = sealed({ uid: UID }, SECRET, () => at)
  assert.equal(opened(s, SECRET, () => at + STATE_GOOD_FOR - 1000).uid, UID)
  assert.equal(opened(s, SECRET, () => at + STATE_GOOD_FOR + 1000), null)
})

test('and every other kind of wrong is the same answer: nothing', () => {
  // One answer for all of them, because the caller's correct response to
  // each is identical — refuse, write nothing — and telling them apart
  // would only help somebody probing.
  assert.equal(opened('', SECRET), null)
  assert.equal(opened('nodothere', SECRET), null)
  assert.equal(opened('.sig', SECRET), null)
  assert.equal(opened(null, SECRET), null)
  assert.equal(opened(sealed({ uid: UID }, SECRET), ''), null)
  // Signed correctly, but carrying nobody.
  assert.equal(opened(sealed({ back: '/x' }, SECRET), SECRET), null)
})
