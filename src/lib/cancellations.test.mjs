import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alreadyOnTrip, flightNumbers, matchEvent, planCancellations, refs } from './cancellations.js'

const flight = (extra = {}) => ({
  id: 'e1',
  kind: 'flight',
  title: 'AY1336 LHR → HEL',
  event_date: '2026-09-25',
  note: 'Booking reference Z7NFKX; Finnair Business · imported',
  ...extra,
})

const hotel = (extra = {}) => ({
  id: 'h1',
  kind: 'hotel',
  title: 'Airbnb — Southwold',
  event_date: '2026-09-14',
  note: 'Confirmation code: HM3BCPYMNX',
  ...extra,
})

test('a booking reference is picked out of surrounding prose', () => {
  assert.deepEqual([...refs('Booking reference Z7NFKX; ticket 125-2237263063')], ['Z7NFKX'])
})

test('ordinary words are not mistaken for references', () => {
  // No digit, so not a record locator however much it looks like shouting.
  assert.equal(refs('LONDON HEATHROW FRIDAY').size, 0)
})

test('flight numbers are found with or without a space', () => {
  assert.deepEqual([...flightNumbers('AY1336 LHR → HEL')], ['AY1336'])
  assert.deepEqual([...flightNumbers('BA 504 to Lisbon')], ['BA504'])
})

test('a shared booking reference matches', () => {
  const item = { kind: 'flight', title: 'Cancelled: Finnair', note: 'Booking reference Z7NFKX' }
  assert.equal(matchEvent(item, [flight()])?.id, 'e1')
})

test('a shared flight number matches when the reference is absent', () => {
  const item = { kind: 'flight', title: 'AY1336 cancelled', event_date: '2026-09-25' }
  assert.equal(matchEvent(item, [flight()])?.id, 'e1')
})

test('same kind and same day matches when nothing else identifies it', () => {
  const item = { kind: 'hotel', title: 'Your reservation was cancelled', event_date: '2026-09-14' }
  assert.equal(matchEvent(item, [hotel()])?.id, 'h1')
})

test('a different kind on the same day is not matched', () => {
  const item = { kind: 'flight', title: 'Cancelled', event_date: '2026-09-14' }
  assert.equal(matchEvent(item, [hotel()]), null)
})

test('two candidates on the same day is treated as no match', () => {
  const item = { kind: 'hotel', title: 'Your reservation was cancelled', event_date: '2026-09-14' }
  const two = [hotel(), hotel({ id: 'h2', title: 'Premier Inn — Southwold', note: '' })]
  assert.equal(matchEvent(item, two), null)
})

test('a reference beats a same-day near miss', () => {
  const item = { kind: 'hotel', title: 'Cancelled', event_date: '2026-09-14', note: 'Confirmation code: HM3BCPYMNX' }
  const two = [hotel(), hotel({ id: 'h2', title: 'Premier Inn — Southwold', note: 'Ref QQ11ZZ99' })]
  assert.equal(matchEvent(item, two)?.id, 'h1')
})

test('a reference that matches nothing on the trip does not fall through to the date', () => {
  // Falling back would delete whatever else happened that day, which is the
  // failure this whole file exists to avoid.
  const item = { kind: 'hotel', title: 'Cancelled', event_date: '2026-09-14', note: 'Confirmation code: ZZ99QQ11' }
  assert.equal(matchEvent(item, [hotel()]), null)
})

test('a flight number that matches nothing does not fall through to the date', () => {
  const item = { kind: 'flight', title: 'BA504 cancelled', event_date: '2026-09-25' }
  assert.equal(matchEvent(item, [flight()]), null)
})

test('no date and nothing identifying is no match', () => {
  assert.equal(matchEvent({ kind: 'hotel', title: 'Cancelled' }, [hotel()]), null)
})

test('an empty trip matches nothing', () => {
  assert.equal(matchEvent({ kind: 'flight', title: 'AY1336', event_date: '2026-09-25' }, []), null)
})

test('the event detail is searched as well as the note', () => {
  const e = { id: 'x', kind: 'flight', title: 'To Helsinki', detail: { flight_number: 'AY1336' } }
  assert.equal(matchEvent({ kind: 'flight', title: 'AY1336 cancelled' }, [e])?.id, 'x')
})

test('planCancellations only reports cancel items, and keeps their index', () => {
  const items = [
    { action: 'add', kind: 'flight', title: 'AY1336 LHR → HEL' },
    { action: 'cancel', kind: 'flight', title: 'AY1336 cancelled', event_date: '2026-09-25' },
  ]
  const plan = planCancellations(items, [flight()])
  assert.equal(plan.length, 1)
  assert.equal(plan[0].index, 1)
  assert.equal(plan[0].event.id, 'e1')
})

test('an unmatched cancellation is reported rather than dropped', () => {
  const items = [{ action: 'cancel', kind: 'hotel', title: 'Cancelled', event_date: '2030-01-01' }]
  const plan = planCancellations(items, [hotel()])
  assert.equal(plan.length, 1)
  assert.equal(plan[0].event, null)
})

test('strict matching refuses the same-day fallback', () => {
  const item = { kind: 'hotel', title: 'Some other place', event_date: '2026-09-14' }
  assert.equal(matchEvent(item, [hotel()], { strict: true }), null)
})

test('a re-forwarded confirmation is recognised as already on the trip', () => {
  const item = { action: 'add', kind: 'hotel', title: 'Airbnb — Southwold', event_date: '2026-09-14',
    detail: { confirmation: 'HM3BCPYMNX' } }
  assert.equal(alreadyOnTrip(item, [hotel()])?.id, 'h1')
})

test('a genuinely different booking on the same day is not a duplicate', () => {
  // Two hotels on one day is ordinary. Only a printed identifier may decide.
  const item = { action: 'add', kind: 'hotel', title: 'Premier Inn — Southwold', event_date: '2026-09-14' }
  assert.equal(alreadyOnTrip(item, [hotel()]), null)
})

test('a re-forwarded flight is recognised by its number', () => {
  const item = { action: 'add', kind: 'flight', title: 'AY1336 LHR → HEL', event_date: '2026-09-25' }
  assert.equal(alreadyOnTrip(item, [flight()])?.id, 'e1')
})

test('cancellations are never treated as duplicates', () => {
  const item = { action: 'cancel', kind: 'flight', title: 'AY1336 cancelled' }
  assert.equal(alreadyOnTrip(item, [flight()]), null)
})
