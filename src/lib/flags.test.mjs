import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emojiFlagToIso, isoToEmojiFlag } from './flags.js'

test('a flag emoji decodes to its country code', () => {
  assert.equal(emojiFlagToIso('🇬🇧'), 'gb')
  assert.equal(emojiFlagToIso('🇦🇺'), 'au')
  assert.equal(emojiFlagToIso('🇹🇭'), 'th')
})

test('and a country code encodes back to one', () => {
  assert.equal(isoToEmojiFlag('gb'), '🇬🇧')
  assert.equal(isoToEmojiFlag('AU'), '🇦🇺')
})

test('every country round-trips', () => {
  // The pair has to be exact both ways: the picker holds ISO codes, the trip
  // cards hold emoji, and CountryFlags only speaks emoji. A code that encodes
  // to something which does not decode back is a flag that renders as nothing.
  for (const iso of ['gb', 'au', 'us', 'th', 'jp', 'cn', 'nz', 'pt', 'ca']) {
    assert.equal(emojiFlagToIso(isoToEmojiFlag(iso)), iso, `${iso} did not survive the round trip`)
  }
})

test('Scotland has no emoji of its own and still works', () => {
  assert.equal(emojiFlagToIso('🏴'), 'gb-sct')
  assert.equal(isoToEmojiFlag('gb-sct'), '🏴')
})

test('rubbish in, nothing out — never a broken glyph', () => {
  assert.equal(isoToEmojiFlag(''), null)
  assert.equal(isoToEmojiFlag('zzz'), null)
  assert.equal(isoToEmojiFlag(null), null)
  assert.equal(emojiFlagToIso(''), null)
  assert.equal(emojiFlagToIso('nope'), null)
})
