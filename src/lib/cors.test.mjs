import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preflight } from '../../api/_lib/cors.js'

const fakeRes = () => {
  const r = { code: null, ended: false }
  r.status = (c) => { r.code = c; return r }
  r.end = () => { r.ended = true; return r }
  return r
}

test('an OPTIONS is answered and stops the handler', () => {
  const res = fakeRes()
  assert.equal(preflight({ method: 'OPTIONS' }, res), true)
  assert.equal(res.code, 204, 'a preflight needs a 2xx or the browser refuses to send the real request')
  assert.equal(res.ended, true)
})

test('anything else passes straight through untouched', () => {
  for (const method of ['POST', 'GET', 'PUT', 'DELETE', 'HEAD']) {
    const res = fakeRes()
    assert.equal(preflight({ method }, res), false, method)
    assert.equal(res.code, null, `${method} must not be answered here`)
    assert.equal(res.ended, false, method)
  }
})

test('a request with no method at all is not mistaken for a preflight', () => {
  const res = fakeRes()
  assert.equal(preflight({}, res), false)
  assert.equal(res.ended, false)
})
