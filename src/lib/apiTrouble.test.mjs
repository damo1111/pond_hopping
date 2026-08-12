import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plainly, stoppedAfter } from './apiTrouble.js'

// The one that started it. A hopper on a preview build was shown the name of
// an environment variable.
test('a missing server key does not become the hopper\'s problem', () => {
  const said = JSON.stringify({ error: 'OPENAI_API_KEY is not configured' })
  const out = plainly(500, said)
  assert.ok(!/OPENAI|API_KEY|configured/i.test(out), out)
  assert.equal(out, 'This one is not switched on here yet.')
})

test('no status at all reads as no signal, not as a fault', () => {
  assert.match(plainly(0, ''), /signal/i)
  assert.match(plainly(undefined, ''), /signal/i)
})

test('each status says whether trying again is worth it', () => {
  assert.match(plainly(401), /sign/i)
  assert.match(plainly(429), /again/i)
  assert.match(plainly(500), /our end/i)
  assert.match(plainly(400), /refused/i)
})

// Config beats the generic 5xx, or every preview build reads as a crash.
test('a configuration 500 is not reported as a breakage', () => {
  assert.notEqual(plainly(500, 'missing api key'), plainly(500, 'null pointer'))
})

test('a busy upstream is distinguished from a broken one', () => {
  assert.match(plainly(500, 'rate limit exceeded'), /again/i)
  assert.match(plainly(503, 'overloaded'), /again/i)
})

// Nothing here may leak a server noun, whatever the body contains.
test('no sentence ever repeats what the server said', () => {
  const nasty = [
    'ECONNREFUSED 10.0.0.4:5432',
    'OPENAI_API_KEY is not configured',
    'PGRST301: JWSError',
    '<html><body>502 Bad Gateway</body></html>',
    'at Object.<anonymous> (/var/task/api/read-receipts.js:114:9)',
  ]
  for (const body of nasty) {
    for (const status of [0, 401, 429, 500, 503]) {
      const out = plainly(status, body)
      assert.ok(!out.includes(body), `${status} leaked the body`)
      assert.ok(!/[A-Z_]{4,}|\/var\/|\.js:|ECONN|<html/.test(out), `${status}: ${out}`)
    }
  }
})

test('what was already done is said before why it stopped', () => {
  assert.match(stoppedAfter(120, 245, 500, 'rate limit'), /^Stopped after 120 of 245\. /)
})

// Nothing done is not worth reporting as progress — "Stopped after 0 of 245"
// is a sentence about failure pretending to be a sentence about progress.
test('nothing done says nothing about progress', () => {
  const out = stoppedAfter(0, 245, 500, 'OPENAI_API_KEY is not configured')
  assert.equal(out, 'This one is not switched on here yet.')
})
