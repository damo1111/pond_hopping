import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RECONSTRUCTED, daysFrom, entryFor, namesForDay, priceIt, sift, stopKey, placesToName } from './tripStory.js'

const COLOSSEUM = { lat: 41.8902, lon: 12.4922 }
const MARKET = { lat: 41.9009, lon: 12.4833 }

const shot = (taken_at, where, taken_on = '2024-01-23') => ({
  id: taken_at,
  taken_at,
  taken_on,
  lat: where?.lat ?? null,
  lon: where?.lon ?? null,
})

// A visit is photographs every few minutes, not two an hour apart — the
// real Roman afternoon was 58 across 114 minutes. Segmenting by time means
// fixtures have to look like real camera rolls.
const during = (fromH, minutes, where, taken_on = '2024-01-23') => {
  const out = []
  for (let m = 0; m <= minutes; m += 6) {
    const h = String(fromH + Math.floor(m / 60)).padStart(2, '0')
    out.push(shot(`${taken_on}T${h}:${String(m % 60).padStart(2, '0')}:00Z`, where, taken_on))
  }
  return out
}

// One day: an hour at the Colosseum, then a while somewhere dense.
const photos = [...during(9, 60, COLOSSEUM), ...during(13, 40, MARKET)]
const days = daysFrom(photos, { id: 't1', start_date: '2024-01-23' })

test('every located place becomes a lookup, and no photograph does', () => {
  // This used to assert only the segments over twenty minutes were looked
  // up, which is exactly what starved the writing: Rome's four days are 31
  // segments and seven of them reached the page. A lookup is cheap and
  // cached on the coordinate; a place nobody can name is not.
  const list = placesToName(days)
  assert.equal(list.length, 2)
  assert.deepEqual(list.map((s) => s.key), [stopKey('2024-01-23', 0), stopKey('2024-01-23', 1)])
  // Eighteen photographs, two lookups. That ratio is the entire point, and
  // the version this replaced would have made twenty.
  assert.ok(list.length < photos.length / 5)
})

test('a stop with no coordinates is not worth asking about', () => {
  const blind = daysFrom(during(9, 60, null), { start_date: '2024-01-23' })
  assert.deepEqual(placesToName(blind), [])
})

test('what the numbers settle costs nothing more', () => {
  const { names, ask } = sift(days, {
    [stopKey('2024-01-23', 0)]: [{ id: 'a', name: 'Colosseum', category: 'Monument', metres: 15 }],
    [stopKey('2024-01-23', 1)]: [{ id: 'b', name: 'Trattoria Luzzi', category: 'Restaurant', metres: 20 }],
  })
  assert.equal(names[stopKey('2024-01-23', 0)], 'Colosseum')
  assert.equal(names[stopKey('2024-01-23', 1)], 'Trattoria Luzzi')
  assert.deepEqual(ask, [])
})

test('and only the crowded spot is worth a photograph', () => {
  // The Borough Market case: four stalls inside the accuracy of the fix.
  const { names, ask } = sift(days, {
    [stopKey('2024-01-23', 0)]: [{ id: 'a', name: 'Colosseum', category: 'Monument', metres: 15 }],
    [stopKey('2024-01-23', 1)]: [
      { id: 'b', name: 'Bread Ahead', category: 'Bakery', metres: 8 },
      { id: 'c', name: 'Kappacasein', category: 'Food Stall', metres: 14 },
      { id: 'd', name: 'Monmouth Coffee', category: 'Cafe', metres: 20 },
    ],
  })
  assert.equal(names[stopKey('2024-01-23', 0)], 'Colosseum')
  assert.equal(ask.length, 1)
  assert.equal(ask[0].key, stopKey('2024-01-23', 1))
  assert.ok(ask[0].shortlist.length >= 2)
  // Two photographs out of six, at one stop out of two.
  assert.equal(ask[0].photos.length, 2)
})

test('the price is knowable before any of it is spent', () => {
  const { ask } = sift(days, {
    [stopKey('2024-01-23', 1)]: [
      { id: 'b', name: 'A', category: 'Food Stall', metres: 8 },
      { id: 'c', name: 'B', category: 'Food Stall', metres: 14 },
    ],
  })
  const price = priceIt(days, ask)
  assert.equal(price.days, 1)
  assert.equal(price.stops, 2)
  assert.equal(price.lookups, 2)
  assert.equal(price.ambiguous, 1)
  assert.equal(price.photosLookedAt, 2)
})

test('a stop nothing is mapped at is simply left unnamed', () => {
  const { names, ask } = sift(days, {})
  assert.deepEqual(names, {})
  assert.deepEqual(ask, [])
})

test('names come back per day, indexed the way that day counts its stops', () => {
  const names = { [stopKey('2024-01-23', 0)]: 'Colosseum', 'other-day#0': 'Elsewhere' }
  assert.deepEqual(namesForDay(days[0], names), { 0: 'Colosseum' })
})

test('the entry is a day told in place names', () => {
  const entry = entryFor(days[0], { id: 't1' }, {
    [stopKey('2024-01-23', 0)]: 'the Colosseum',
    [stopKey('2024-01-23', 1)]: 'Trattoria Luzzi',
  })
  assert.equal(entry.trip_id, 't1')
  assert.equal(entry.entry_date, '2024-01-23')
  assert.match(entry.title, /Colosseum/)
  assert.match(entry.note, /Colosseum/)
  assert.ok(entry.note.includes(RECONSTRUCTED))
  assert.deepEqual(entry.tags, ['reconstructed'])
  // The thing that made the first attempt worthless.
  assert.doesNotMatch(entry.note, /\d+ photographs/)
})

test('city is the place that held the day, not the first thing seen', () => {
  const entry = entryFor(days[0], { id: 't1' }, {
    [stopKey('2024-01-23', 0)]: 'a quick coffee',
    [stopKey('2024-01-23', 1)]: 'the Vatican Museums',
  })
  // Segment 0 is 60 minutes, segment 1 is 40 — the longer one wins.
  assert.equal(entry.city, 'a quick coffee')
})

test('a run makes a day even with no photographs on it', () => {
  // The failure that started this rewrite: the day the app knew most about
  // was the one it said least about.
  const withRun = daysFrom([], { id: 't1', start_date: '2024-01-23' }, {
    runs: [{ run_date: '2024-01-23', distance_km: '21.39', pace: '4:50', elevation_m: 178 }],
  })
  assert.equal(withRun.length, 1)
  const entry = entryFor(withRun[0], { id: 't1' }, {})
  assert.match(entry.note, /21\.4 km run/)
  assert.match(entry.note, /4:50 pace/)
})

test('an entry with nothing named still has a title, because the column is NOT NULL', () => {
  const entry = entryFor(days[0], { id: 't1' }, {})
  assert.ok(entry.title.length > 0)
  assert.ok(entry.note.includes(RECONSTRUCTED))
})

test('a day is made of segments, and the count on the button comes from placesToName', () => {
  // The screen read d.stops and threw — "Cannot read properties of undefined
  // (reading 'filter')" — because a day stopped having stops when it started
  // having segments, and one caller was left behind. Counting through the
  // same function that decides what gets looked up is what stops the number
  // on the button and the number of lookups drifting apart again.
  const day = days[0]
  assert.ok(Array.isArray(day.segments))
  assert.equal(day.stops, undefined)
  assert.equal(placesToName(days).length, priceIt(days, []).lookups)
})

test('a place walked past is named too, and never costs a photograph', () => {
  // Rome, 24 January, 17:38–17:48: twenty-three photographs in ten minutes.
  // Under the old rule that was "passing through", got no lookup, and never
  // reached the writer. Twenty-four of the trip's thirty-one segments went
  // that way. It is named now — but a ten-minute pause does not get a
  // vision call, because two dozen image requests a trip to settle
  // questions nobody asked is how the economics went wrong the other way.
  const brief = daysFrom(during(17, 10, MARKET, '2024-01-24'), { start_date: '2024-01-24' })
  assert.equal(placesToName(brief).length, 1)

  const key = stopKey('2024-01-24', 0)
  const crowd = [
    { id: 'a', name: 'Bread Ahead', metres: 8, category: 'bakery' },
    { id: 'b', name: 'Neal’s Yard Dairy', metres: 14, category: 'cheese shop' },
    { id: 'c', name: 'Kappacasein', metres: 19, category: 'food stall' },
  ]
  const { ask, near } = sift(brief, { [key]: crowd })
  assert.deepEqual(ask, [])
  assert.deepEqual(near[key], ['Bread Ahead', 'Neal’s Yard Dairy', 'Kappacasein'])
})

test('a place stayed at still earns its photograph', () => {
  const key = stopKey('2024-01-23', 1)
  const { ask } = sift(days, {
    [key]: [
      { id: 'a', name: 'Bread Ahead', metres: 8, category: 'bakery' },
      { id: 'b', name: 'Neal’s Yard Dairy', metres: 14, category: 'cheese shop' },
    ],
  })
  assert.equal(ask.length, 1)
  assert.equal(ask[0].key, key)
})
