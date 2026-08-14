import { test } from 'node:test'
import assert from 'node:assert/strict'
import { APP_LINK, comeBackTo } from './comeBackTo.js'

test('a native sign-in comes back to the App Link, not to the app’s own origin', () => {
  // This is the whole bug. Inside the Android wrapper the origin is
  // https://localhost — the bundled assets' own address — which is not on
  // Supabase's allow-list and is not a link Android can hand to anybody. Sent
  // that, Supabase falls back to the Site URL, so the session lands in Chrome
  // on the web site and the app stays signed out looking broken.
  assert.equal(comeBackTo(true, 'https://localhost'), APP_LINK)
  // iOS serves them from a scheme that is not even http.
  assert.equal(comeBackTo(true, 'capacitor://localhost'), APP_LINK)
})

test('and the web comes back to itself, not to production', () => {
  // A preview deployment signing you back into pond.eend.app would be a
  // different kind of broken, and a harder one to notice.
  assert.equal(
    comeBackTo(false, 'https://pond-hopping-git-something.vercel.app'),
    'https://pond-hopping-git-something.vercel.app/'
  )
  assert.equal(comeBackTo(false, 'http://localhost:5173'), 'http://localhost:5173/')
})

test('the trailing slash is always there, and never doubled', () => {
  // Supabase globs treat `/` as a separator, so `https://host/**` cannot
  // match a bare origin — sent bare, the redirect is silently refused.
  assert.equal(comeBackTo(false, 'https://pond.eend.app'), 'https://pond.eend.app/')
  assert.equal(comeBackTo(false, 'https://pond.eend.app/'), 'https://pond.eend.app/')
  assert.equal(comeBackTo(false, 'https://pond.eend.app///'), 'https://pond.eend.app/')
  assert.ok(APP_LINK.endsWith('/'))
})
