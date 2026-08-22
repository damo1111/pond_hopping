import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CODES, COMMON, choices, guessHome, nameOf, search } from './homePond.js'

test('the timezone answers where somebody lives, with no permission asked', () => {
  // The whole reason this exists: a location prompt before anybody has seen
  // what the app does is the fastest way to be denied it forever.
  assert.equal(guessHome('Europe/London'), 'gb')
  assert.equal(guessHome('Australia/Melbourne'), 'au')
  assert.equal(guessHome('America/New_York'), 'us')
  assert.equal(guessHome('Pacific/Auckland'), 'nz')
})

test('and every Australian city counts, not just the capitals', () => {
  // Prove the check can fail: matched city-by-city, Broken Hill is nobody.
  for (const city of ['Australia/Broken_Hill', 'Australia/Perth', 'Australia/Eucla']) {
    assert.equal(guessHome(city), 'au', `${city} should be Australia`)
  }
})

test('Canada is not the United States', () => {
  // America/* falls through to us, so the Canadian zones have to be named
  // before it — which is the exact case David's friends are in.
  assert.equal(guessHome('America/Toronto'), 'ca')
  assert.equal(guessHome('America/Vancouver'), 'ca')
  assert.equal(guessHome('America/Edmonton'), 'ca')
})

test('the locale answers when the timezone cannot', () => {
  assert.equal(guessHome('Antarctica/Troll', 'en-GB'), 'gb')
  assert.equal(guessHome('', 'fr-CA'), 'ca')
})

test('but a bare language never does', () => {
  // "en" says nothing about where anybody is, and reading the United States
  // into it is exactly the assumption this app should not make. Passed
  // explicitly, because omitting the argument asks the environment instead —
  // and in Node that answers en-US, which is how this was first written wrong.
  assert.equal(guessHome('', 'en'), null)
  assert.equal(guessHome('', ''), null)
  assert.equal(guessHome('', 'not-a-locale'), null)
})

test('a guess we already offer is promoted, not duplicated', () => {
  const got = choices('au')
  assert.equal(got[0], 'au')
  assert.deepEqual([...new Set(got)], got, 'no country appears twice')
  assert.equal(got.length, COMMON.length)
})

test('and a guess we do not offer goes on top of the ones we do', () => {
  // Making somebody in Canada search for Canada while three other countries
  // sit above it is absurd.
  const got = choices('ca')
  assert.equal(got[0], 'ca')
  assert.deepEqual(got.slice(1), COMMON)
})

test('with no guess at all, the three defaults stand', () => {
  assert.deepEqual(choices(null), COMMON)
})

test('countries are named, not coded', () => {
  assert.equal(nameOf('gb'), 'United Kingdom')
  assert.equal(nameOf('au'), 'Australia')
  assert.equal(nameOf('TH'), 'Thailand')
})

test('and a nonsense code degrades to something still tappable', () => {
  // Never throws and never renders an empty row: whatever Intl says about an
  // unknown region — it says "Unknown Region" — is better than a blank line
  // somebody can still tap.
  assert.equal(nameOf(''), '')
  assert.equal(nameOf('zzz'), '')
  assert.ok(nameOf('zz').length > 0)
  assert.doesNotThrow(() => nameOf(null))
})

test('what people type finds what the standard calls it', () => {
  // Each of these is a real thing a real person types. Somebody entering
  // "England" is not going to be told there is no such place.
  for (const typed of ['uk', 'england', 'great britain', 'scotland']) {
    assert.equal(search(typed)[0].code, 'gb', `"${typed}" should find the UK`)
  }
  assert.equal(search('holland')[0].code, 'nl')
  assert.equal(search('america')[0].code, 'us')
})

test('what somebody typed in full beats what they merely started', () => {
  // The bug this replaced: ranking prefixes alone, "uk" returned Ukraine —
  // its name begins with those letters and sorts first — so the single most
  // likely thing a British tester types found the wrong country.
  assert.equal(search('uk')[0].code, 'gb')
  assert.ok(
    search('uk').findIndex((c) => c.code === 'ua') > 0,
    'Ukraine should still be findable, just not first'
  )
})

test('matches at the start of a name beat matches in the middle', () => {
  // Substring matching put Turkmenistan above Oman for "man", and a list that
  // does that stops looking like it understood the question.
  const got = search('oman').map((c) => c.code)
  assert.equal(got[0], 'om')
})

test('but a word inside a name still counts', () => {
  const got = search('guinea').map((c) => c.code)
  assert.ok(got.includes('pg'), 'Papua New Guinea should be findable by its last word')
})

test('an empty search is not everything', () => {
  // The un-searched state shows choices(), not two hundred and fifty rows in
  // alphabetical order — that is not an answer to a question nobody asked.
  assert.deepEqual(search(''), [])
  assert.deepEqual(search('   '), [])
  assert.deepEqual(search(null), [])
})

test('the code list is whole and clean', () => {
  assert.ok(CODES.length > 200, `only ${CODES.length} countries`)
  assert.deepEqual([...new Set(CODES)], CODES, 'a country is listed twice')
  assert.ok(
    CODES.every((c) => /^[a-z]{2}$/.test(c)),
    'every entry is a two-letter lowercase code'
  )
  for (const c of COMMON) assert.ok(CODES.includes(c), `${c} is offered but not in the list`)
})
