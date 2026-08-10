import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flagToCode, relevantCodes, sortByRelevance } from './relevance.js'

const trip = (start_date, end_date, ...countries) => ({ start_date, end_date, countries })
const TODAY = '2026-08-10'

test('a flag is a country code with an offset, not a lookup table', () => {
  assert.equal(flagToCode('🇭🇰'), 'HK')
  assert.equal(flagToCode('🇰🇷'), 'KR')
  assert.equal(flagToCode('🇵🇹'), 'PT')
  assert.equal(flagToCode('🇳🇿'), 'NZ')
})

test('anything that is not a flag is not a country', () => {
  // 🏴 is a real trip country in this app, and is not two regional
  // indicators — it must not come out as nonsense.
  assert.equal(flagToCode('🏴'), null)
  assert.equal(flagToCode('🇭'), null)
  assert.equal(flagToCode('AB'), null)
  assert.equal(flagToCode(''), null)
  assert.equal(flagToCode(undefined), null)
  assert.equal(flagToCode('🦆'), null)
})

test('the trip you are on comes first', () => {
  const codes = relevantCodes(
    [trip('2026-09-01', '2026-09-10', '🇯🇵'), trip('2026-08-08', '2026-08-14', '🇹🇭')],
    TODAY
  )
  assert.deepEqual(codes, ['TH', 'JP'])
})

test('then the soonest one coming, not the biggest', () => {
  const codes = relevantCodes(
    [trip('2027-01-01', '2027-02-01', '🇺🇸'), trip('2026-08-20', '2026-08-22', '🇵🇹')],
    TODAY
  )
  assert.deepEqual(codes, ['PT', 'US'])
})

test('and past trips last, most recent first', () => {
  const codes = relevantCodes(
    [trip('2024-01-22', '2024-01-25', '🇮🇹'), trip('2026-07-01', '2026-07-08', '🇰🇷')],
    TODAY
  )
  assert.deepEqual(codes, ['KR', 'IT'])
})

test('future beats past even when the past is closer', () => {
  // Home yesterday from Korea, in Japan in a fortnight. Japan is the one
  // worth knowing the currency for.
  const codes = relevantCodes(
    [trip('2026-07-25', '2026-08-09', '🇰🇷'), trip('2026-08-24', '2026-08-30', '🇯🇵')],
    TODAY
  )
  assert.deepEqual(codes, ['JP', 'KR'])
})

test('a country on two trips takes its best position', () => {
  // Been to Japan years ago and going again next week — next week is what
  // matters, and the old trip must not bury it.
  const codes = relevantCodes(
    [trip('2020-03-01', '2020-03-10', '🇯🇵'), trip('2026-08-14', '2026-08-20', '🇯🇵', '🇰🇷')],
    TODAY
  )
  assert.deepEqual(codes, ['JP', 'KR'])
})

test('trips with no dates or no countries are simply not evidence', () => {
  assert.deepEqual(relevantCodes([trip(null, null, '🇯🇵')], TODAY), [])
  assert.deepEqual(relevantCodes([trip('2026-08-01', '2026-08-05')], TODAY), [])
  assert.deepEqual(relevantCodes([], TODAY), [])
  assert.deepEqual(relevantCodes(undefined, TODAY), [])
})

test('sorting brings the relevant forward and keeps the rest as they were', () => {
  const list = ['AUD', 'EUR', 'GBP', 'JPY', 'KRW']
  assert.deepEqual(
    sortByRelevance(list, (c) => ({ AUD: 'AU', EUR: 'PT', GBP: 'GB', JPY: 'JP', KRW: 'KR' })[c], ['JP', 'KR']),
    ['JPY', 'KRW', 'AUD', 'EUR', 'GBP']
  )
})

test('nothing relevant leaves the list exactly as it was', () => {
  // The important half of "sorted, not filtered": with no trips at all the
  // screen is unchanged rather than empty.
  const list = ['AUD', 'EUR', 'GBP']
  assert.deepEqual(sortByRelevance(list, (c) => c, []), list)
  assert.deepEqual(sortByRelevance(list, (c) => c, ['ZZ']), list)
})

test('everything stays reachable — sorting never drops one', () => {
  const list = ['AUD', 'EUR', 'GBP', 'JPY']
  const out = sortByRelevance(list, (c) => (c === 'JPY' ? 'JP' : c), ['JP'])
  assert.equal(out.length, list.length)
  assert.deepEqual([...out].sort(), [...list].sort())
})
