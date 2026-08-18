import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SOON_DAYS, daysUntil, frontOfMind, heroWhen, tileLeads } from './frontOfMind.js'

const TODAY = '2026-08-18'
const trip = (o) => ({ slug: o.slug ?? 'x', is_demo: false, ...o })

const LIVE = trip({ slug: 'live', start_date: '2026-08-13', end_date: '2026-08-22' })
const SOON = trip({ slug: 'soon', start_date: '2026-08-23', end_date: '2026-08-29' })
const FAR = trip({ slug: 'far', start_date: '2026-11-01', end_date: '2026-11-10' })
const PAST = trip({ slug: 'past', start_date: '2024-01-22', end_date: '2024-01-25' })

test('the trip you are on outranks everything', () => {
  const pick = frontOfMind([FAR, SOON, PAST, LIVE], TODAY)
  assert.equal(pick.trip.slug, 'live')
  assert.equal(pick.when, 'live')
})

test('and with nothing live, the next one inside the week', () => {
  const pick = frontOfMind([FAR, SOON, PAST], TODAY)
  assert.equal(pick.trip.slug, 'soon')
  assert.equal(pick.when, 'soon')
  assert.equal(pick.days, 5)
})

test('a trip further out than the week is not the present', () => {
  // Prove the check can fail: without the window, FAR would be the hero for
  // the two and a half months before it, which is a countdown nobody asked
  // for on the biggest thing on the page.
  assert.equal(frontOfMind([FAR, PAST], TODAY), null)
  assert.equal(daysUntil(FAR.start_date, TODAY) > SOON_DAYS, true)
})

test('and a page of only past trips has no hero at all', () => {
  assert.equal(frontOfMind([PAST], TODAY), null)
  assert.equal(frontOfMind([], TODAY), null)
})

test('an example is never the hero', () => {
  // The Lisbon example is held permanently five days out by a cron. Without
  // this it would be the hero of every home screen for ever, counting down
  // to somebody else's holiday — and it would be the biggest thing on the
  // page while doing it.
  const demo = trip({ slug: 'demo-portugal', start_date: '2026-08-23', is_demo: true })
  assert.equal(frontOfMind([demo], TODAY), null)
  assert.equal(frontOfMind([demo, SOON], TODAY).trip.slug, 'soon')
})

test('two trips running at once: the one that ends first', () => {
  // Rare and real — a weekend away inside a longer stay. The one with an
  // ending closer to hand is the one with something imminent about it.
  const longer = trip({ slug: 'longer', start_date: '2026-08-01', end_date: '2026-09-30' })
  assert.equal(frontOfMind([longer, LIVE], TODAY).trip.slug, 'live')
})

test('the hero says which day of how many', () => {
  assert.equal(heroWhen(frontOfMind([LIVE], TODAY), TODAY), 'Day 6 of 10')
  assert.equal(heroWhen(frontOfMind([SOON], TODAY), TODAY), 'In 5 days')
  assert.equal(heroWhen(null, TODAY), null)
})

test('and says only the day when nobody has said when it ends', () => {
  // "of" needs a number and there is not one. Inventing an end is worse
  // than not saying it — and an unclosed trip is the ordinary state of a
  // trip somebody is on.
  const open = trip({ slug: 'open', start_date: '2026-08-13', end_date: null })
  assert.equal(heroWhen(frontOfMind([open], TODAY), TODAY), 'Day 6')
})

test('tomorrow is tomorrow, not "in 1 days"', () => {
  const t = trip({ slug: 'tm', start_date: '2026-08-19', end_date: '2026-08-25' })
  assert.equal(heroWhen(frontOfMind([t], TODAY), TODAY), 'Tomorrow')
})

test('the way-in tile leads only while nothing on the globe is yours', () => {
  const demo = trip({ slug: 'demo-portugal', start_date: '2026-08-23', is_demo: true })
  assert.equal(tileLeads([]), true)
  assert.equal(tileLeads([demo]), true)
  assert.equal(tileLeads([demo, PAST]), false)
})
