import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applied } from './applied.js'

test('a row came back, so it happened', () => {
  assert.deepEqual(applied({ data: [{ id: 1 }] }), { ok: true, why: null })
  assert.deepEqual(applied({ data: { id: 1 } }), { ok: true, why: null })
})

test('no rows is a refusal, not a success', () => {
  // The whole reason this exists. RLS answers 204 with no error.
  const r = applied({ data: [], error: null }, 'that photo')
  assert.equal(r.ok, false)
  assert.match(r.why, /isn't yours to edit/)
  assert.match(r.why, /that photo/)
})

test('an actual error says what the database said', () => {
  const r = applied({ data: null, error: { message: 'boom' } })
  assert.deepEqual(r, { ok: false, why: 'boom' })
})

test('nothing at all is still a refusal', () => {
  assert.equal(applied({}).ok, false)
  assert.equal(applied().ok, false)
})
