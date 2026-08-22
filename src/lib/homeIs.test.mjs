import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAPITALS, homeIs } from './homeIs.js'
import { apart } from './spotTrip.js'

test('at home, the timezone sharpens the country into a city', () => {
  const home = homeIs('gb', 'Europe/London')
  assert.equal(home.known, true)
  assert.equal(home.from, 'zone')
  assert.ok(apart({ lat: home.lat, lon: home.lng }, { lat: 51.5, lon: -0.13 }) < 20)
})

test('abroad, the country still decides — this is the whole feature', () => {
  // David's friends: the app installed in Canada, home said to be the UK. If
  // the timezone won here they would be measured against Edmonton, every
  // photograph would be "near home", and nothing would ever be offered.
  const home = homeIs('gb', 'America/Edmonton')
  assert.equal(home.from, 'capital')
  assert.ok(apart({ lat: home.lat, lon: home.lng }, { lat: 51.5, lon: -0.13 }) < 20, 'London, not Alberta')
})

test('a Canadian at home in Canada is not sent to Ottawa', () => {
  // The regional zones matter: America/Vancouver is Canada, not the US.
  const home = homeIs('ca', 'America/Vancouver')
  assert.equal(home.from, 'zone')
  assert.ok(apart({ lat: home.lat, lon: home.lng }, { lat: 49.3, lon: -123.1 }) < 20)
})

test('no answer means no idea, and no idea means no offer', () => {
  for (const bad of [null, undefined, '', 'x', 'gbr', 'GB!', 42]) {
    assert.equal(homeIs(bad, 'Europe/London').known, false, `${bad}`)
  }
})

test('a country we have no city for says so rather than guessing', () => {
  // Bouvet Island is a real ISO code and nobody's home. Silence beats the
  // middle of the Atlantic.
  assert.equal(homeIs('bv', 'Europe/London').known, false)
})

test('case and whitespace in the stored answer do not break it', () => {
  assert.equal(homeIs('GB', 'Asia/Tokyo').known, true)
})

test('every capital is a real coordinate', () => {
  for (const [code, at] of Object.entries(CAPITALS)) {
    assert.ok(Array.isArray(at) && at.length === 2, code)
    assert.ok(at[0] >= -90 && at[0] <= 90, `${code} latitude`)
    assert.ok(at[1] >= -180 && at[1] <= 180, `${code} longitude`)
    // 0,0 is the Gulf of Guinea and is what a missing entry looks like.
    assert.ok(at[0] !== 0 || at[1] !== 0, `${code} is null island`)
  }
})

test('the three countries the testers are in are all covered', () => {
  for (const code of ['gb', 'au', 'us', 'ca']) assert.ok(CAPITALS[code], code)
})
