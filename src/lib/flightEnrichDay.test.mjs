import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askAbout, believable, NOT_A_DELAY_MS } from './flightEnrich.js'

// The flight that started it. MH146 leaves Melbourne 08:45 on 3 April,
// which is 21:45Z on the 2nd. Asking for the 2nd returns the aircraft that
// left Melbourne on the 2nd — a real flight, and the wrong one.
test('the day is the one at the airport, not the one in UTC', () => {
  assert.equal(askAbout('2026-04-02T21:45:00Z', 'Australia/Melbourne'), '2026-04-03')
})

test('which is what the old code got wrong', () => {
  assert.notEqual(askAbout('2026-04-02T21:45:00Z', 'Australia/Melbourne'), '2026-04-02T21:45:00Z'.slice(0, 10))
})

test('and the other way round, west of Greenwich', () => {
  // 20:10 in Los Angeles on the 6th is 04:10Z on the 7th.
  assert.equal(askAbout('2026-03-07T04:10:00Z', 'America/Los_Angeles'), '2026-03-06')
})

test('a flight in the middle of its own day is unaffected', () => {
  assert.equal(askAbout('2026-04-06T07:45:00Z', 'Asia/Bangkok'), '2026-04-06')
  assert.equal(askAbout('2026-06-15T12:00:00Z', 'Europe/London'), '2026-06-15')
})

// Summer time is the reason this cannot be an offset baked in once.
test('it follows the zone across a daylight-saving change', () => {
  // Melbourne is +11 on 4 April 2026 and +10 on 6 April.
  assert.equal(askAbout('2026-04-03T14:30:00Z', 'Australia/Melbourne'), '2026-04-04')
  assert.equal(askAbout('2026-04-05T14:30:00Z', 'Australia/Melbourne'), '2026-04-06')
})

test('a bare offset works when there is no zone name', () => {
  assert.equal(askAbout('2026-04-02T21:45:00Z', 11), '2026-04-03')
  assert.equal(askAbout('2026-04-02T21:45:00Z', 0), '2026-04-02')
})

test('no zone at all falls back to UTC rather than to nothing', () => {
  assert.equal(askAbout('2026-04-02T21:45:00Z'), '2026-04-02')
  assert.equal(askAbout('2026-04-02T21:45:00Z', 'Mars/Olympus'), '2026-04-02')
})

test('nonsense in is null out, not a crash', () => {
  for (const bad of [null, undefined, '', 'not a date']) {
    assert.doesNotThrow(() => askAbout(bad, 'Europe/London'), String(bad))
    assert.equal(askAbout(bad, 'Europe/London'), null, String(bad))
  }
})

// ── The guard ────────────────────────────────────────────────────────────

test('a real delay is believable', () => {
  assert.equal(believable('2026-04-06T07:45:00Z', '2026-04-06T07:58:00Z'), true, '13 minutes')
  assert.equal(believable('2026-04-03T08:00:00Z', '2026-04-03T11:30:00Z'), true, 'three and a half hours')
})

// A departure genuinely 24 hours late is not a delay, it is a cancellation
// and a rebooking — and every one of the seventeen looked like this.
test('a day is not a delay', () => {
  assert.equal(believable('2026-04-02T21:45:00Z', '2026-04-01T22:08:00Z'), false, 'MH146 as recorded')
  assert.equal(believable('2026-04-27T12:20:00Z', '2026-04-26T12:20:00Z'), false, 'exactly a day early')
  assert.equal(believable('2026-05-07T04:30:00Z', '2026-05-08T04:28:00Z'), false, 'a day late counts too')
})

test('it refuses in both directions at the same distance', () => {
  const t = '2026-04-02T12:00:00Z'
  const off = NOT_A_DELAY_MS + 60_000
  assert.equal(believable(t, new Date(Date.parse(t) + off).toISOString()), false)
  assert.equal(believable(t, new Date(Date.parse(t) - off).toISOString()), false)
})

// Nothing to check is not the same as something wrong. A flight with no
// actual time recorded must not be treated as a disagreement.
test('a missing time is not a disagreement', () => {
  assert.equal(believable('2026-04-02T21:45:00Z', null), true)
  assert.equal(believable(null, '2026-04-02T21:45:00Z'), true)
  assert.equal(believable('rubbish', '2026-04-02T21:45:00Z'), true)
})

// ── The guard, where it actually sits ────────────────────────────────────
import { enrichment } from './flightEnrich.js'

const mh146 = { dep_time: '2026-04-02T21:45:00Z', arr_time: '2026-04-03T06:30:00Z' }

test('a wrong-day answer is dropped rather than written down', () => {
  const { patch } = enrichment(
    mh146,
    { actual_dep_time: '2026-04-01T22:08:00Z', actual_arr_time: '2026-04-02T05:47:00Z', registration: '9M-MTB' },
    'aerodatabox'
  )
  assert.equal(patch.actual_dep_time, undefined)
  assert.equal(patch.actual_arr_time, undefined)
  // And the rest of the answer still lands: the day was wrong, the tail
  // number was not necessarily.
  assert.equal(patch.registration, '9M-MTB')
})

test('a real delay on the same flight is written down as normal', () => {
  const { patch } = enrichment(
    mh146,
    { actual_dep_time: '2026-04-02T22:31:00Z', actual_arr_time: '2026-04-03T07:15:00Z' },
    'aerodatabox'
  )
  assert.equal(patch.actual_dep_time, '2026-04-02T22:31:00Z')
  assert.equal(patch.actual_arr_time, '2026-04-03T07:15:00Z')
})

// If the wrong day were the *only* thing on offer, dropping it must leave
// nothing rather than an empty enrichment stamp claiming the flight was done.
test('nothing believable left means nothing was learned', () => {
  const { patch } = enrichment(mh146, { actual_dep_time: '2026-04-01T22:08:00Z' }, 'aerodatabox')
  assert.deepEqual(patch, {})
})
