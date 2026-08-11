import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backfill, verdictOf } from './flightBackfill.js'

const NOW = new Date('2026-08-11T00:00:00Z')
const flown = (id, over = {}) => ({
  id,
  flight_number: `XX${id}`,
  dep_airport: 'HKG',
  dep_time: '2026-07-07T01:10:00Z',
  ...over,
})

// Nothing waits in tests. The pace is real and tested separately.
const run = (flights, ask, save) =>
  backfill(flights, { ask, save, now: NOW, breath: 0, wait: async () => {} })

test('an answer with fields is a flight filled in', () => {
  assert.equal(verdictOf({ found: true, fields: { registration: 'B-KPU' } }), 'filled')
})

test('a source with no record is finished with', () => {
  assert.equal(verdictOf({ found: false }), 'nothing')
  assert.equal(verdictOf({ found: true, fields: {} }), 'nothing')
})

test('a rate limit is not an answer', () => {
  // The distinction the whole thing turns on: declining to answer must
  // never look like "there is nothing here".
  assert.equal(verdictOf({ found: false, status: 429 }), 'again')
  assert.equal(verdictOf({ found: false, status: 503 }), 'again')
  assert.equal(verdictOf({}, false), 'again')
})

test('every flight is filled and written once', async () => {
  const wrote = []
  const tally = await run(
    [flown(1), flown(2)],
    async () => ({ ok: true, answer: { found: true, fields: { registration: 'B-KPU' } } }),
    async (id, patch) => wrote.push([id, patch])
  )
  assert.equal(tally.filled, 2)
  assert.equal(tally.total, 2)
  assert.equal(wrote.length, 2)
  assert.equal(wrote[0][1].registration, 'B-KPU')
  assert.equal(wrote[0][1].enriched_from, 'aerodatabox')
})

test('a flight already asked about is not asked again', async () => {
  let asked = 0
  const tally = await run(
    [flown(1, { enriched_at: '2026-08-01T00:00:00Z' }), flown(2)],
    async () => {
      asked++
      return { ok: true, answer: { found: true, fields: { registration: 'B-KPU' } } }
    },
    async () => {}
  )
  assert.equal(asked, 1)
  assert.equal(tally.total, 1)
})

test('a source with no record stamps the flight so it is never asked again', async () => {
  const wrote = []
  const tally = await run([flown(1)], async () => ({ ok: true, answer: { found: false } }), async (id, p) =>
    wrote.push(p)
  )
  assert.equal(tally.nothing, 1)
  assert.equal(wrote[0].enriched_from, 'aerodatabox:none')
  assert.ok(wrote[0].enriched_at)
})

test('a source that is down leaves the flight for next time', async () => {
  // The one that must never be stamped: a bad afternoon for an API would
  // otherwise mark every flight done for ever and nothing would ask again.
  const wrote = []
  const tally = await run([flown(1)], async () => ({ ok: false, answer: {} }), async (id, p) => wrote.push(p))
  assert.equal(tally.failed, 1)
  assert.equal(wrote.length, 0)
})

test('a rate limit is waited out before giving up', async () => {
  let tries = 0
  const tally = await run(
    [flown(1)],
    async () => {
      tries++
      return tries < 3
        ? { ok: true, answer: { found: false, status: 429 } }
        : { ok: true, answer: { found: true, fields: { registration: 'B-KPU' } } }
    },
    async () => {}
  )
  assert.equal(tries, 3)
  assert.equal(tally.filled, 1)
})

test('a thrown request is a failure, not a crash', async () => {
  const tally = await run([flown(1)], async () => { throw new Error('offline') }, async () => {})
  assert.equal(tally.failed, 1)
  assert.equal(tally.done, 1)
})

test('progress is reported as it goes, not at the end', async () => {
  const seen = []
  await backfill([flown(1), flown(2), flown(3)], {
    ask: async () => ({ ok: true, answer: { found: true, fields: { registration: 'X' } } }),
    save: async () => {},
    onStep: (t) => seen.push(t.done),
    now: NOW,
    breath: 0,
    wait: async () => {},
  })
  assert.deepEqual(seen, [1, 2, 3])
})

test('one at a time, with a gap between them', async () => {
  // Two fired together answered one and 429'd the other.
  let inFlight = 0
  let most = 0
  let waited = 0
  await backfill([flown(1), flown(2), flown(3)], {
    ask: async () => {
      inFlight++
      most = Math.max(most, inFlight)
      await Promise.resolve()
      inFlight--
      return { ok: true, answer: { found: true, fields: { registration: 'X' } } }
    },
    save: async () => {},
    now: NOW,
    breath: 5,
    wait: async () => { waited++ },
  })
  assert.equal(most, 1)
  assert.equal(waited, 3)
})

test('nothing to do is not an error', async () => {
  const tally = await run([], async () => ({ ok: true, answer: {} }), async () => {})
  assert.deepEqual(tally, { total: 0, done: 0, filled: 0, nothing: 0, failed: 0, disagreed: 0 })
})
