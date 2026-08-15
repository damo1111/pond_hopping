import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coverUrl, thumb } from './imgTransform.js'

const STORED = 'https://qslksdgxoibzrisywvqk.supabase.co/storage/v1/object/public/photos/trip/abc.webp'

test('nothing we host is ever sent to be transformed', () => {
  // The Pro plan counts distinct source files transformed, and the account
  // reached 600% of it — at which point every transformed URL in the app
  // stops resolving at once. These files are already 2048px and 400px; there
  // was nothing to render.
  assert.equal(thumb(STORED), STORED)
  assert.equal(coverUrl(STORED, { width: 700, height: 385 }), STORED)
  // Prove it: the render endpoint must not appear, whatever is asked for.
  assert.ok(!thumb(STORED).includes('/render/image/'))
  assert.ok(!coverUrl(STORED, { width: 1400, height: 1800 }).includes('/render/image/'))
})

test('but Google still resizes its own, because Google does it for nothing', () => {
  const g = 'https://lh3.googleusercontent.com/abc'
  assert.equal(coverUrl(g, { width: 400, height: 220 }), 'https://lh3.googleusercontent.com/abc=w400-h220-c')
})

test('and anything else is handed back untouched', () => {
  assert.equal(coverUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg')
  assert.equal(coverUrl(null), null)
  assert.equal(coverUrl(''), '')
  assert.equal(thumb(undefined), undefined)
})
