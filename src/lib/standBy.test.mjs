import { test } from 'node:test'
import assert from 'node:assert/strict'
import { standBy, alsoSay, ALL_LINES, HOLD_MS } from './standBy.js'

test('each stage has something of its own to say', () => {
  assert.notEqual(standBy('looking', 0), standBy('writing', 0))
  assert.notEqual(standBy('working it out', 0), standBy('writing', 0))
})

test('an unknown or missing stage still says something', () => {
  assert.ok(standBy(null, 0))
  assert.ok(standBy('some new stage', 0))
  assert.ok(standBy(undefined))
})

// Random picks repeat, and a repeat inside a minute reads as the app having
// got stuck rather than as a joke coming round again.
test('the lines walk rather than shuffle', () => {
  const seen = []
  for (let i = 0; i < ALL_LINES.looking.length; i++) {
    seen.push(standBy('looking', i * HOLD_MS))
  }
  assert.equal(new Set(seen).size, ALL_LINES.looking.length, 'every line before any repeat')
})

test('and come round again rather than running out', () => {
  const n = ALL_LINES.looking.length
  assert.equal(standBy('looking', 0), standBy('looking', n * HOLD_MS))
})

test('a line holds for its whole turn', () => {
  assert.equal(standBy('looking', 0), standBy('looking', HOLD_MS - 1))
  assert.notEqual(standBy('looking', 0), standBy('looking', HOLD_MS))
})

test('time going backwards does not crash it', () => {
  assert.ok(standBy('looking', -5000))
  assert.equal(standBy('looking', -5000), standBy('looking', 0))
})

// The obvious fear when you add more mid-run is that you have broken it, or
// that it will have to start again. Neither is true, and it says so.
test('photographs added while it runs are acknowledged, not ignored', () => {
  assert.match(standBy('looking', 0, 40), /40/)
  assert.match(standBy('looking', 0, 40), /still going/i)
})

test('one extra is one, not 1', () => {
  assert.match(standBy('looking', 0, 1), /extra one/)
  assert.ok(!/\b1\b/.test(standBy('looking', 0, 1)))
})

test('nothing extra goes back to the ordinary lines', () => {
  assert.equal(standBy('looking', 0, 0), standBy('looking', 0))
})

// Promising a notification to a device that cannot receive one is the worst
// possible version of this sentence.
test('the second line only promises a nudge when one can be sent', () => {
  assert.match(alsoSay({ canPush: true }), /nudge/i)
  assert.ok(!/nudge/i.test(alsoSay({ canPush: false })))
  assert.ok(!/nudge/i.test(alsoSay()))
})

test('both versions still say you can close the app', () => {
  assert.match(alsoSay({ canPush: true }), /close the app/i)
  assert.match(alsoSay({ canPush: false }), /close the app/i)
})

// The voice is the point. A line that is a percentage or a spinner in words
// would defeat the whole exercise.
test('no line pretends to know how long it will take', () => {
  for (const list of Object.values(ALL_LINES)) {
    for (const line of list) {
      assert.ok(line.length < 60, line)
      assert.ok(!/%|\d+ ?(seconds|minutes|mins)/i.test(line), line)
      assert.match(line, /[.!?]$/, `${line} — every line is a sentence`)
    }
  }
})
