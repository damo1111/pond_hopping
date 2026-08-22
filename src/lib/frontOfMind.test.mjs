import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SOON_DAYS, daysUntil, frontOfMind, heroWhen, tripProgress } from './frontOfMind.js'

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

test('an example never becomes the hero, trip alongside it or not', () => {
  // The Lisbon example is held permanently five days out by a cron. Left in
  // the running it would be the biggest thing on somebody's own home screen
  // for ever, counting down to a holiday that is not theirs.
  const demo = trip({ slug: 'demo-portugal', start_date: '2026-08-23', is_demo: true })
  assert.equal(frontOfMind([demo, SOON], TODAY).trip.slug, 'soon')
  assert.equal(frontOfMind([demo, PAST], TODAY), null)
})

test('not even while it is the only thing there', () => {
  // Tried the other way once: the example was allowed to be the hero while
  // nothing real existed, on the theory that a cold visitor otherwise saw no
  // hero at all. In practice that sold a stranger's holiday as the biggest
  // thing on the page to exactly the person who has added nothing of their
  // own — the hero slot is the way in for them, not somebody else's trip.
  const live = trip({ slug: 'demo-thailand-now', start_date: '2026-08-13', end_date: '2026-08-22', is_demo: true })
  assert.equal(frontOfMind([live], TODAY), null)
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

// ── How far through ───────────────────────────────────────────────────────

test('the progress and the words are the same two numbers', () => {
  // They used to be worked out separately — the arithmetic lived inside
  // heroWhen's template string, so nothing else could draw it. A bar that
  // disagrees with the caption above it is worse than no bar.
  const trip = { start_date: '2026-08-16', end_date: '2026-08-25' }
  const pick = { trip, when: 'now' }
  const today = '2026-08-21'
  const { day, total, part } = tripProgress(pick, today)
  assert.equal(day, 6)
  assert.equal(total, 10)
  assert.equal(heroWhen(pick, today), `Day ${day} of ${total}`)
  assert.ok(part > 0.5 && part <= 0.6)
})

test('the first day is day one, not day zero', () => {
  const pick = { trip: { start_date: '2026-08-16', end_date: '2026-08-25' }, when: 'now' }
  assert.equal(tripProgress(pick, '2026-08-16').day, 1)
})

test('a trip with no end draws no bar rather than a made-up one', () => {
  // "I'm off now" makes one of these. Inventing a length so the bar has
  // something to fill would be drawing a fact nobody has.
  const pick = { trip: { start_date: '2026-08-16', end_date: null }, when: 'now' }
  const got = tripProgress(pick, '2026-08-21')
  assert.equal(got.total, null)
  assert.equal(got.part, null)
  assert.equal(got.day, 6, 'but it still knows which day it is')
  assert.equal(heroWhen(pick, '2026-08-21'), 'Day 6')
})

test('and nothing at all is safe to ask about', () => {
  assert.deepEqual(tripProgress(null), { day: 0, total: null, part: null })
  assert.deepEqual(tripProgress({}), { day: 0, total: null, part: null })
})

test('the last day is full, never over', () => {
  const pick = { trip: { start_date: '2026-08-16', end_date: '2026-08-25' }, when: 'now' }
  assert.equal(tripProgress(pick, '2026-08-25').part, 1)
})

test('and a trip with no start date says nothing rather than "Day 1"', () => {
  // daysUntil returns null, and Math.abs(null) + 1 is 1 — so this used to
  // state a made-up fact as confidently as a real one.
  const pick = { trip: { start_date: null, end_date: '2026-08-25' }, when: 'now' }
  assert.deepEqual(tripProgress(pick, '2026-08-21'), { day: 0, total: null, part: null })
})
