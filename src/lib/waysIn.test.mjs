import { test } from 'node:test'
import assert from 'node:assert/strict'
import { waysIn, offerIn, lastWayIn, rememberWayIn, WAYS } from './waysIn.js'

const store = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  }
}

// A missing setting must not put a dead button in front of somebody: a
// provider the Supabase project has not been told about answers "Unsupported
// provider", which is not a sentence anybody should read.
test('nothing configured offers nothing, and the sheet is what it always was', () => {
  assert.deepEqual(waysIn(''), [])
  assert.deepEqual(waysIn(), [])
  assert.deepEqual(waysIn(null), [])
})

test('what is configured is what is offered', () => {
  assert.deepEqual(waysIn('apple').map((w) => w.id), ['apple'])
  assert.deepEqual(waysIn('apple,google').map((w) => w.id), ['apple', 'google'])
})

test('whitespace and case in an environment variable are not the hopper\'s problem', () => {
  assert.deepEqual(waysIn(' Apple ,  GOOGLE ').map((w) => w.id), ['apple', 'google'])
})

test('a provider we do not know is ignored rather than drawn', () => {
  assert.deepEqual(waysIn('apple,facebook,myspace').map((w) => w.id), ['apple'])
})

test('duplicates are one button', () => {
  assert.deepEqual(waysIn('google,google,apple').map((w) => w.id), ['apple', 'google'])
})

test('the order is ours, not the order somebody typed', () => {
  assert.deepEqual(waysIn('google,apple').map((w) => w.id), ['apple', 'google'])
})

// "Which of these did I use last time?" is the single most common way
// somebody ends up with two accounts.
test('what they used last time comes first', () => {
  const s = store()
  rememberWayIn('google', s)
  const { ways, last } = offerIn('apple,google', s)
  assert.equal(last, 'google')
  assert.deepEqual(ways.map((w) => w.id), ['google', 'apple'])
})

test('a remembered way that is no longer offered is forgotten quietly', () => {
  const s = store()
  rememberWayIn('google', s)
  const { ways, last } = offerIn('apple', s)
  assert.equal(last, null)
  assert.deepEqual(ways.map((w) => w.id), ['apple'])
})

test('the code counts as a way in, so it can be remembered too', () => {
  const s = store()
  rememberWayIn('code', s)
  assert.equal(s.getItem('pond:way_in'), 'code')
})

test('junk is never remembered', () => {
  const s = store()
  rememberWayIn('myspace', s)
  assert.equal(s.getItem('pond:way_in'), null)
})

test('no storage at all is survivable', () => {
  assert.doesNotThrow(() => rememberWayIn('apple', null))
  assert.equal(lastWayIn(null, [WAYS.apple]), null)
  assert.deepEqual(offerIn('apple', null).ways.map((w) => w.id), ['apple'])
})

test('every way has something to write on the button', () => {
  for (const w of Object.values(WAYS)) assert.ok(w.label, w.id)
})
