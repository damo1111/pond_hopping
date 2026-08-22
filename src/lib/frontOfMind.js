// Which one trip is the reason somebody opened the app.
//
// Home shows every trip at one weight, in one horizontal strip, in a fixed
// order that begins with the empty "Add a trip" tile. So somebody in the
// middle of a holiday opens the app and the first card is a blank invitation
// to start another one, with the trip they are actually on sitting off the
// right-hand edge.
//
// The sections were the right idea and stopped half way: Home already knows
// which trips are Right now, Coming up and Been there. What it does not do is
// act on the difference. This picks the one trip that is the present, so it
// can be lifted out of the strip and put above it.
//
// One at a time, always. Two heroes is a dashboard, and the whole point is
// that there is one obvious thing.
//
// Pure, because "seven days before a trip" and "the last day of a trip" are
// exactly the dates nobody is standing on when they write the code.

import { tripPhase } from './tripPhase.js'
import { ownTrips } from './demoTour.js'

/**
 * How close is close enough to be the present.
 *
 * A week. Near enough that it is what is on somebody's mind — the packing,
 * the last thing unbooked, the early start — and far enough out that the
 * countdown has somewhere to go. Beyond that a trip is a plan, and plans
 * live in the strip with everything else.
 */
export const SOON_DAYS = 7

const DAY = 86400000
const parse = (d) => (d ? Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) : NaN)

/** Whole days from today to a date; negative once it is behind. */
export function daysUntil(date, today) {
  const a = parse(date)
  const b = parse(today)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((a - b) / DAY)
}

/**
 * The trip to put above the strip, or null.
 *
 * Precedence, and the order matters:
 *
 *   1. One you are on. Nothing outranks it.
 *   2. One starting within the week, nearest first.
 *   3. Nothing — and then Home is the strip, as it always was.
 *
 * Never the example, even while it is the only thing there. That was tried:
 * the reasoning was that a cold visitor, whose whole app is the examples,
 * would otherwise see no hero at all on the one screen built to show what
 * this is for. In practice it sold a stranger's holiday as the biggest thing
 * on the page to somebody who has not added anything of their own yet — the
 * hero slot is where the way in belongs for them, not a photograph of a trip
 * they didn't take. See WorldTab, which puts the add-trip tile in the hero
 * slot whenever this returns null and nothing real is on the globe yet.
 */
export function frontOfMind(trips = [], today) {
  const mine = ownTrips(trips).filter((t) => t?.start_date)
  const now = new Date(`${String(today).slice(0, 10)}T12:00:00Z`)

  const live = mine
    .filter((t) => tripPhase(t, now) === 'live')
    // Two at once is rare and real — a weekend inside a longer trip. The one
    // that ends first is the one with something imminent about it.
    .sort((a, b) => String(a.end_date ?? a.start_date).localeCompare(String(b.end_date ?? b.start_date)))
  if (live.length) return { trip: live[0], when: 'live', days: daysUntil(live[0].start_date, today) }

  const soon = mine
    .filter((t) => {
      const n = daysUntil(t.start_date, today)
      return n != null && n > 0 && n <= SOON_DAYS
    })
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
  if (soon.length) return { trip: soon[0], when: 'soon', days: daysUntil(soon[0].start_date, today) }

  return null
}

/**
 * What the hero says about when.
 *
 * Short enough to sit over a photograph. "Day 6" rather than "Day 6 of 10"
 * when the trip has no end date, because "of" needs a number and inventing
 * one is worse than not saying it.
 */
export function heroWhen(pick, today) {
  if (!pick) return null
  if (pick.when === 'soon') {
    return pick.days === 1 ? 'Tomorrow' : `In ${pick.days} days`
  }
  const { day, total } = tripProgress(pick, today)
  return total ? `Day ${day} of ${total}` : `Day ${day}`
}

/**
 * How far through a trip somebody is, as numbers rather than as a sentence.
 *
 * heroWhen() has said "Day 6 of 10" for a while, and worked it out inside the
 * string — so nothing else could draw it. The arithmetic lives here now and
 * heroWhen reads it, which means the bar and the words cannot disagree: they
 * are the same two numbers rendered twice.
 *
 * `total` is null rather than a guess when there is no end date. A trip with
 * an open end is a real thing — "I'm off now" makes one — and inventing a
 * length so the bar has something to fill would be drawing a fact nobody has.
 *
 * @returns { day, total, part } — part is 0…1, or null with no total.
 */
export function tripProgress(pick, today) {
  if (!pick?.trip) return { day: 0, total: null, part: null }
  const started = daysUntil(pick.trip.start_date, today)
  // A trip with no start date has no day one. Without this, daysUntil's null
  // fell through Math.abs(null) + 1 and the card said "Day 1" — a made-up
  // fact stated as confidently as a real one.
  if (started == null) return { day: 0, total: null, part: null }
  const day = Math.abs(started) + 1
  const end = daysUntil(pick.trip.end_date, today)
  if (end == null) return { day, total: null, part: null }
  const total = day + end
  if (total <= 0) return { day, total: null, part: null }
  return { day, total, part: Math.max(0, Math.min(1, day / total)) }
}
