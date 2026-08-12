import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checklist, worthAsking, summarise, richness, couldAdd, HAVES } from './whatWeHave.js'

const thailand = { photographs: 238, flights: 6, runs: 2, stays: 0, said: 0 }

test('a row per kind, ticked or not', () => {
  const rows = checklist(thailand)
  assert.equal(rows.length, HAVES.length)
  assert.equal(rows.find((r) => r.key === 'photographs').got, true)
  assert.equal(rows.find((r) => r.key === 'stays').got, false)
})

test('counts that are absent read as none rather than as NaN', () => {
  const rows = checklist({})
  assert.ok(rows.every((r) => r.n === 0 && r.got === false))
  assert.equal(checklist(null).length, HAVES.length)
})

// Two hundred and thirty-eight photographs against six flights would draw a
// bar that is almost entirely photographs — true about the pile, false about
// the story. The six flights fix the shape of the whole trip; the two
// hundredth beach adds nothing the hundredth did not.
test('the bar is not a count', () => {
  const many = richness({ photographs: 5000 }).filled
  const few = richness({ photographs: 3 }).filled
  assert.equal(many, few, 'more of one kind is not more evidence')
})

test('more kinds is a fuller bar', () => {
  const one = richness({ photographs: 10 }).filled
  const two = richness({ photographs: 10, flights: 2 }).filled
  const lot = richness({ photographs: 10, flights: 2, stays: 4, said: 1, runs: 1 }).filled
  assert.ok(two > one)
  assert.equal(lot, 1)
})

test('the kinds worth most fill most of it', () => {
  const words = richness({ said: 1 }).filled
  const runs = richness({ runs: 1 }).filled
  assert.ok(words > runs, 'your own words beat a run')
})

test('nothing at all is an empty bar rather than a divide by zero', () => {
  const out = richness({})
  assert.equal(out.filled, 0)
  assert.ok(out.segments.every((s) => s.share > 0), 'every kind still has a slot')
})

test('the segments add up to the whole bar', () => {
  const total = richness(thailand).segments.reduce((n, s) => n + s.share, 0)
  assert.ok(Math.abs(total - 1) < 1e-9, total)
})

test('every segment carries a colour to draw it in', () => {
  for (const s of richness(thailand).segments) assert.match(s.colour, /^#[0-9A-F]{6}$/i, s.key)
})

test('the line says what it has, in as few words as are still true', () => {
  assert.equal(summarise(thailand), '238 photos · 6 flights · 2 runs')
  assert.equal(summarise({ photographs: 1 }), '1 photos')
  assert.equal(summarise({}), 'Nothing on this trip yet')
})

test('big numbers are grouped, because 1238 is harder to read than 1,238', () => {
  assert.match(summarise({ photographs: 1238 }), /1,238/)
})

// A list of everything you have not done is a chore.
test('the chips are the best of what is missing, and never more than three', () => {
  const chips = couldAdd({ photographs: 1 })
  assert.ok(chips.length <= 3)
  assert.deepEqual(chips.map((c) => c.key), ['said', 'stays', 'flights'], 'best first')
})

test('nothing missing is no chips', () => {
  assert.deepEqual(couldAdd({ photographs: 1, flights: 1, stays: 1, said: 1, runs: 1 }), [])
})

// A trip with everything does not need a screen telling it so, and the build
// refuses an empty one, so this must not pretend the choice exists.
test('nothing to ask when it already has the lot, or nothing at all', () => {
  assert.equal(worthAsking({ photographs: 1, flights: 1, stays: 1, said: 1, runs: 1 }), false)
  assert.equal(worthAsking({}), false)
})

test('worth asking when something real is missing', () => {
  assert.equal(worthAsking(thailand), true, 'no stays, and stays are the strongest evidence there is')
})

// Most people write nothing, and a travel log that opens by telling you off
// is not one anybody keeps.
test('the optional ones alone are never a reason to ask', () => {
  assert.equal(worthAsking({ photographs: 9, flights: 2, stays: 3, said: 0, runs: 0 }), false)
})

test('every kind has a name, a weight, a colour and something to do about it', () => {
  for (const h of HAVES) {
    assert.ok(h.has && h.missing && h.get && h.route, h.key)
    assert.ok(h.weight > 0, h.key)
    assert.ok(h.colour, h.key)
  }
})

// With the value order alone, a trip missing the two heaviest kinds opened
// with two empty blocks and looked like a failure before the eye reached
// anything it had.
test('the bar shows what it has before what it has not', () => {
  const segs = richness(thailand).segments
  const firstEmpty = segs.findIndex((s) => !s.got)
  const lastFull = segs.map((s) => s.got).lastIndexOf(true)
  assert.ok(lastFull < firstEmpty, segs.map((s) => `${s.key}:${s.got}`).join(' '))
})

test('and within each half the most valuable still comes first', () => {
  const segs = richness({ said: 1, photographs: 1 }).segments
  assert.deepEqual(segs.map((s) => s.key), ['said', 'photographs', 'stays', 'flights', 'runs'])
})
