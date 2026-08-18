import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AHEAD_DAYS, datesOf, laidOut, nightsOf, saidBriefly, stillToCome, whenIs } from './whereYouAre.js'

const TRIP = { start_date: '2026-08-13', end_date: '2026-08-22' }
const TODAY = '2026-08-18'

const ev = (date, o = {}) => ({ event_date: date, kind: 'activity', done: false, ...o })
const pic = (date, o = {}) => ({ taken_on: date, taken_at: `${date}T09:00:00Z`, ...o })

test('a trip you are on has a behind, a today and an ahead', () => {
  const lane = laidOut({ trip: TRIP, today: TODAY })
  assert.equal(lane.phase, 'live')
  assert.equal(lane.behind.length, 5)
  assert.equal(lane.today.date, TODAY)
  assert.equal(lane.today.index, 6) // day six of ten
  assert.equal(lane.ahead.length, 4)
  assert.equal(lane.rest, 0)
  assert.equal(lane.total, 10)
})

test('and the same trip read from before or after it has neither', () => {
  // Prove the check can fail: if `phase` came from a status column rather
  // than the dates, these two would still say 'live'.
  assert.equal(laidOut({ trip: TRIP, today: '2026-08-01' }).phase, 'upcoming')
  assert.equal(laidOut({ trip: TRIP, today: '2026-09-01' }).phase, 'past')
  assert.equal(laidOut({ trip: TRIP, today: '2026-09-01' }).today, null)
  assert.equal(laidOut({ trip: TRIP, today: '2026-08-01' }).behind.length, 0)
})

test('the far end of a long trip is counted, not drawn', () => {
  // Forty days of a hundred-day trip turns the screen you check at breakfast
  // into a scroll. The rest still has to be reachable, so it is a number
  // rather than nothing.
  const long = { start_date: '2026-08-13', end_date: '2026-11-20' }
  const lane = laidOut({ trip: long, today: TODAY })
  assert.equal(lane.ahead.length, AHEAD_DAYS)
  assert.equal(lane.behind.length + 1 + lane.ahead.length + lane.rest, lane.total)
  assert.ok(lane.rest > 80)
})

test('a trip nobody has closed still has days behind it', () => {
  // The ordinary state of a trip you are on: the end date is what you fill
  // in when you get home. Treated as broken, the lane would be one day long
  // and the four days you have already had would vanish.
  const open = { start_date: '2026-08-13', end_date: null }
  const lane = laidOut({ trip: open, today: TODAY })
  assert.equal(lane.phase, 'live')
  assert.equal(lane.behind.length, 5)
  assert.equal(lane.today.date, TODAY)
  assert.equal(lane.ahead.length, 0)
  // And read before it starts it is one day, not a trip running to today.
  assert.equal(datesOf(open, { today: '2026-08-01' }).length, 1)
})

test('a stay covers its nights, not only the day you checked in', () => {
  // Keyed by date, a hotel appears on arrival day and vanishes for the three
  // nights you are actually in it — on a lane whose job is "where am I
  // tonight", exactly backwards.
  const hotel = { kind: 'hotel', event_date: '2026-08-13', end_date: '2026-08-17', title: 'The Siam' }
  const nights = nightsOf([hotel])
  assert.deepEqual([...nights.keys()], ['2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17'])
  assert.deepEqual(nights.get('2026-08-15'), [{ stay: hotel, night: 3, of: 5 }])
  // The same object, not a copy: a card that lets you edit the stay must
  // reach the row, from whichever night it was opened on.
  assert.equal(nights.get('2026-08-15')[0].stay, hotel)

  const lane = laidOut({ trip: TRIP, today: TODAY, events: [hotel] })
  assert.equal(lane.behind[0].events.length, 1) // check-in day carries the row
  assert.equal(lane.behind[0].stay.length, 0)
  assert.equal(lane.behind[2].events.length, 0) // and the nights carry the stay
  assert.equal(lane.behind[2].stay.length, 1)
})

test('a one-night stay is a night, and a zero-night one is not a stay', () => {
  assert.equal(nightsOf([{ kind: 'hotel', event_date: '2026-08-13', end_date: '2026-08-14' }]).size, 1)
  // Same day in and out is a booking mistake or a day room; either way there
  // is no night to put on a lane.
  assert.equal(nightsOf([{ kind: 'hotel', event_date: '2026-08-13', end_date: '2026-08-13' }]).size, 0)
  assert.equal(nightsOf([{ kind: 'activity', event_date: '2026-08-13', end_date: '2026-08-17' }]).size, 0)
})

test("a day's things are in the order they happen, and the untimed go last", () => {
  const lane = laidOut({
    trip: TRIP,
    today: TODAY,
    events: [
      ev(TODAY, { title: 'dinner', start_time: '19:30' }),
      ev(TODAY, { title: 'whenever', sort_order: 5 }),
      ev(TODAY, { title: 'morning', start_time: '09:00' }),
    ],
  })
  assert.deepEqual(lane.today.events.map((e) => e.title), ['morning', 'dinner', 'whenever'])
})

test('what is left of today comes from the ticks, not the clock', () => {
  // Something at 15:30 already ticked is finished at two; something at 09:00
  // that never happened is still outstanding at six.
  const day = {
    events: [ev(TODAY, { start_time: '15:30', done: true }), ev(TODAY, { start_time: '09:00', done: false })],
  }
  assert.equal(stillToCome(day), 1)
  assert.equal(stillToCome(null), 0)
})

test('a day behind you says where you were before it says how many pictures', () => {
  const day = laidOut({
    trip: TRIP,
    today: TODAY,
    events: [ev('2026-08-15', { city: 'Ayutthaya' }), ev('2026-08-15', { kind: 'flight', city: 'Ayutthaya' })],
    photos: [pic('2026-08-15'), pic('2026-08-15')],
  }).behind[2]
  // Not "· 2 photographs" as well: the thumbnail strip beside this row
  // already says that, in pictures, and saying it in words truncated the
  // half that matters. See saidBriefly.
  assert.equal(saidBriefly(day), 'Ayutthaya · a flight')
})

test('but a day of photographs and no named place still counts them', () => {
  // Otherwise the fallback swallows the day: forty pictures and the row
  // reads "Nothing recorded".
  const day = laidOut({ trip: TRIP, today: TODAY, photos: [pic('2026-08-14'), pic('2026-08-14')] }).behind[1]
  assert.equal(saidBriefly(day), '2 photographs')
})

test('and a day with nothing on it says so rather than nothing at all', () => {
  // A travel day, or a day nobody took a picture, is a real day. An empty
  // row reads as a bug.
  const day = laidOut({ trip: TRIP, today: TODAY }).behind[0]
  assert.equal(saidBriefly(day), 'Nothing recorded')
  assert.equal(saidBriefly(null), '')
})

test('whenIs is the same answer the sections on Home give', () => {
  assert.equal(whenIs('2026-08-17', TODAY), 'behind')
  assert.equal(whenIs('2026-08-18', TODAY), 'today')
  assert.equal(whenIs('2026-08-19', TODAY), 'ahead')
})
