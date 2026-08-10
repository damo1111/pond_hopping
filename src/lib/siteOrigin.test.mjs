import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SITE, siteOrigin } from './siteOrigin.js'

const at = (href) => new URL(href)

test('the iOS app shares the website, not itself', () => {
  // The actual bug: capacitor://localhost/?share=… is not a URL anybody
  // else's phone can open, and the share sheet gave no sign of it.
  assert.equal(siteOrigin(at('capacitor://localhost/')), SITE)
})

test('other non-web schemes are the same mistake', () => {
  assert.equal(siteOrigin(at('ionic://localhost/')), SITE)
  assert.equal(siteOrigin(at('file:///android_asset/index.html')), SITE)
})

test('a browser shares the page it is actually on', () => {
  assert.equal(siteOrigin(at('https://pond.eend.app/')), 'https://pond.eend.app')
})

test('a preview deployment shares itself, which is the point of a preview', () => {
  const preview = 'https://pond-hopping-git-branch-x.vercel.app'
  assert.equal(siteOrigin(at(`${preview}/?share=rome`)), preview)
})

test('localhost shares localhost, so a share can be tested at all', () => {
  assert.equal(siteOrigin(at('http://localhost:5173/')), 'http://localhost:5173')
})

test('no location at all is the live site rather than a crash', () => {
  assert.equal(siteOrigin(undefined), SITE)
  assert.equal(siteOrigin(null), SITE)
  assert.equal(siteOrigin({}), SITE)
  // A location-shaped object with the right protocol but no origin — the
  // fallback has to cover it, or the link reads "undefined/?share=…".
  assert.equal(siteOrigin({ protocol: 'https:' }), SITE)
})

test('the link this produces is one somebody else can open', () => {
  const url = `${siteOrigin(at('capacitor://localhost/'))}/?share=china-japan-example&show=journal,flights,map`
  assert.equal(url, 'https://pond.eend.app/?share=china-japan-example&show=journal,flights,map')
  assert.doesNotThrow(() => new URL(url))
})
