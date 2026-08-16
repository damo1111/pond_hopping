import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFacts, MATTERS, whatIsMissing } from './buildFacts.js'

test('a build with everything says nothing, because that is the ordinary case', () => {
  assert.equal(whatIsMissing({ VITE_WAYS_IN: 'apple,google', VITE_INBOX_ADDRESS: 'in@eend.app' }), null)
})

test('and one built without the providers says so', () => {
  // The actual iOS bug: every TestFlight build shipped with an empty
  // provider list because Xcode Cloud never had the variable, and the only
  // symptom was a tester saying "there's no Google button".
  const said = whatIsMissing({ VITE_INBOX_ADDRESS: 'in@eend.app' })
  assert.match(said, /sign-in providers/)
})

test('an empty string is absent, not present', () => {
  // What an unset variable looks like once a shell has interpolated it. It
  // behaves exactly like absent, so it has to be reported that way — this is
  // the reading that would otherwise say "set" on a broken build.
  const facts = buildFacts({ VITE_WAYS_IN: '', VITE_INBOX_ADDRESS: '   ' })
  assert.equal(facts.every((f) => f.there === false), true)
  assert.match(whatIsMissing({ VITE_WAYS_IN: '' }), /sign-in providers/)
})

test('both missing reads as a sentence rather than a list', () => {
  assert.equal(whatIsMissing({}), 'built without sign-in providers and forwarding address')
})

test('nothing here leaks a value, only whether it was there', () => {
  // Some of these are keys. The answer is a boolean by construction.
  const facts = buildFacts({ VITE_WAYS_IN: 'apple,google', VITE_INBOX_ADDRESS: 'secret@eend.app' })
  const asText = JSON.stringify(facts)
  assert.ok(!asText.includes('secret@eend.app'))
  assert.ok(!asText.includes('apple,google'))
  assert.equal(facts.every((f) => typeof f.there === 'boolean'), true)
})

test('the list is only settings whose absence changes what somebody sees', () => {
  // Supabase url and key both have hardcoded fallbacks pointing at the real
  // project, so a build without them behaves identically — listing them
  // would be noise on every build forever.
  const keys = MATTERS.map((m) => m.key)
  assert.ok(!keys.includes('VITE_SUPABASE_URL'))
  assert.ok(!keys.includes('VITE_SUPABASE_ANON_KEY'))
  assert.ok(keys.includes('VITE_WAYS_IN'))
})

test('a missing env object does not throw inside a diagnostics panel', () => {
  assert.doesNotThrow(() => buildFacts())
  assert.doesNotThrow(() => whatIsMissing())
  assert.equal(buildFacts(null).length, MATTERS.length)
})
