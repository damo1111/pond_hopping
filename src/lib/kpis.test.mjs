import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rate, asPercent, movement, countMovement, read, readAll, METRICS, ENOUGH, WORTH_SAYING_PP,
} from './kpis.js'

const row = (metric, n, d, n_before, d_before) => ({ metric, n, d, n_before, d_before })

// One person in three is 33%, and next week it is 0% or 50% for reasons that
// have nothing to do with the product.
test('a rate under the floor is refused rather than stated', () => {
  assert.equal(rate(1, 3), null)
  assert.equal(rate(1, ENOUGH - 1), null)
  assert.equal(rate(1, ENOUGH), 1 / ENOUGH)
})

test('nothing at all is not a rate of zero', () => {
  assert.equal(rate(0, 0), null)
  assert.equal(rate(5, null), null)
  assert.equal(rate(5, undefined), null)
})

test('a percentage is whole, because a tenth here is invented', () => {
  assert.equal(asPercent(0.565), '57%')
  assert.equal(asPercent(null), null)
})

test('a movement needs both halves to be worth stating', () => {
  assert.equal(movement(row('x', 50, 100, 1, 3)), null, 'the before is too thin')
  assert.equal(movement(row('x', 1, 3, 50, 100)), null, 'the now is too thin')
})

test('and a movement inside the noise is not reported as a trend', () => {
  assert.equal(movement(row('x', 51, 100, 50, 100)), null)
  assert.equal(movement(row('x', 60, 100, 50, 100)), 10)
  assert.equal(movement(row('x', 40, 100, 50, 100)), -10)
})

test('the noise floor is where it says it is', () => {
  const justUnder = WORTH_SAYING_PP - 1
  assert.equal(movement(row('x', 50 + justUnder, 100, 50, 100)), null)
  assert.equal(movement(row('x', 50 + WORTH_SAYING_PP, 100, 50, 100)), WORTH_SAYING_PP)
})

// Two of these metrics get worse as they get bigger, and both are easy to
// read as wins on anything that assumes growth is good.
test('a rising bounce is worse, not better', () => {
  const bounced = METRICS.find((m) => m.key === 'bounced')
  const up = read(bounced, [row('bounced', 60, 100, 40, 100)])
  assert.equal(up.moved, 20)
  assert.equal(up.better, false)

  const down = read(bounced, [row('bounced', 40, 100, 60, 100)])
  assert.equal(down.better, true)
})

test('a rising activation is better', () => {
  const made = METRICS.find((m) => m.key === 'made_a_trip')
  assert.equal(read(made, [row('made_a_trip', 60, 100, 40, 100)]).better, true)
})

test('a plain count carries no rate and no denominator', () => {
  const opened = METRICS.find((m) => m.key === 'opened')
  const out = read(opened, [row('opened', 144, null, 63, null)])
  assert.equal(out.n, 144)
  assert.equal(out.d, null)
  assert.equal(out.share, null)
  assert.equal(out.enough, true, 'a count is always sayable — it is not a rate')
  assert.equal(out.moved, 129, 'and it moved a long way up')
})

test('a count off a tiny base does not claim a percentage swing', () => {
  assert.equal(countMovement(row('x', 9, null, 3, null)), null)
  assert.equal(countMovement(row('x', 200, null, 100, null)), 100)
})

test('a metric with no row at all reads as nothing rather than throwing', () => {
  const out = read(METRICS[0], [])
  assert.equal(out.n, 0)
  assert.equal(out.moved, null)
  assert.deepEqual(readAll([]).length, METRICS.length)
})

// The shape the database actually returns, end to end.
test('the real numbers read the way they should', () => {
  const rows = [
    row('opened', 144, null, 63, null),
    row('bounced', 87, 154, 30, 60),
    row('made_a_trip', 1, 1, 0, 0),
  ]
  const all = readAll(rows)
  const bounce = all.find((m) => m.key === 'bounced')
  assert.equal(bounce.percent, '56%')
  assert.equal(bounce.enough, true)

  // One session out of one is not a 100% activation rate, and this is
  // exactly the number a dashboard would otherwise shout about.
  const made = all.find((m) => m.key === 'made_a_trip')
  assert.equal(made.enough, false)
  assert.equal(made.percent, null)
  assert.equal(made.n, 1)
})

test('every metric has a label, and the rates all have something to be a share of', () => {
  for (const m of METRICS) {
    assert.ok(m.label, m.key)
    assert.ok(m.of === null || typeof m.of === 'string', m.key)
  }
})

// A number that rounds differently from the one you would get on paper is
// the kind of thing that quietly destroys trust in a dashboard.
test('a halfway percentage rounds the way a person would do it', () => {
  assert.equal(asPercent(0.565), '57%', '0.565 * 100 is 56.499999999999993 in binary')
  assert.equal(asPercent(0.005), '1%')
  assert.equal(asPercent(87 / 154), '56%', 'and the real one is unaffected')
})
