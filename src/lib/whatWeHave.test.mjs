import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checklist, worthAsking, summarise, HAVES } from './whatWeHave.js'

const thailand = { photographs: 238, flights: 6, runs: 2, stays: 0, said: 0 }

test('a row per kind, ticked or not', () => {
  const rows = checklist(thailand)
  assert.equal(rows.length, HAVES.length)
  assert.equal(rows.find((r) => r.key === 'photographs').got, true)
  assert.equal(rows.find((r) => r.key === 'stays').got, false)
})

test('what is missing is named as something to go and get', () => {
  const stays = checklist(thailand).find((r) => r.key === 'stays')
  assert.equal(stays.label, 'No record of where you stopped')
  assert.equal(stays.get, 'Add Timeline')
})

test('counts that are absent read as none rather than as NaN', () => {
  const rows = checklist({})
  assert.ok(rows.every((r) => r.n === 0 && r.got === false))
  assert.deepEqual(checklist(null).length, HAVES.length)
})

// A trip with everything does not need a screen telling it so.
test('nothing to ask when it already has the lot', () => {
  assert.equal(worthAsking({ photographs: 1, flights: 1, stays: 1, said: 1, runs: 1 }), false)
})

// The build refuses an empty trip, so this must not pretend the choice exists.
test('nothing to ask when it has nothing at all', () => {
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

test('the summary says what it has before what it lacks', () => {
  const line = summarise(thailand)
  assert.match(line, /^238 photographs/)
  assert.match(line, /plenty to write from/)
  assert.ok(!/no |missing/i.test(line), line)
})

test('one of a thing is said in the singular', () => {
  assert.match(summarise({ photographs: 1 }), /^1 photograph —/)
  assert.match(summarise({ flights: 1 }), /^1 flight —/)
  assert.match(summarise({ said: 1 }), /^1 day in your own words/)
  assert.match(summarise({ said: 3 }), /^3 days in your own words/)
})

test('several things are joined the way a person would say them', () => {
  assert.match(summarise({ photographs: 12, flights: 2, runs: 1 }), /12 photographs, 2 flights and 1 run/)
})

test('a trip with nothing says so plainly', () => {
  assert.equal(summarise({}), 'Nothing on this trip yet.')
})

test('big numbers are grouped, because 1238 is harder to read than 1,238', () => {
  assert.match(summarise({ photographs: 1238 }), /1,238/)
})

test('every kind has both a name and something to do about it', () => {
  for (const h of HAVES) {
    assert.ok(h.has && h.missing && h.get && h.route, h.key)
  }
})
