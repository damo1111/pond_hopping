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
 * The example is allowed to be the hero, but only while it is the only thing
 * there.
 *
 * Excluding it outright was the first rule and it was too blunt. It is right
 * about the case it was written for — Lisbon is held permanently five days
 * out by a cron, so on somebody's own home screen it would be the biggest
 * thing on the page for ever, counting down to a holiday that is not theirs.
 * But it also made the hero unreachable by the people who most need
 * something to look at: a cold visitor, whose entire app is the examples,
 * and who therefore saw no hero at all on the one screen built to show what
 * this is for.
 *
 * Which is exactly the distinction demoVisibility.showDemo already draws:
 * the example is there while it is the only thing there, and steps aside the
 * moment one real trip exists. Same rule, one place further in.
 */
export function frontOfMind(trips = [], today) {
  const real = ownTrips(trips).filter((t) => t?.start_date)
  const mine = real.length ? real : (trips ?? []).filter((t) => t?.start_date)
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
  const started = daysUntil(pick.trip.start_date, today)
  const day = Math.abs(started) + 1
  const end = daysUntil(pick.trip.end_date, today)
  if (end == null) return `Day ${day}`
  const total = day + end
  return total > 0 ? `Day ${day} of ${total}` : `Day ${day}`
}

/**
 * Whether the way-in tile still leads the strip.
 *
 * It should, while the only thing on the globe is somebody else's example —
 * that is a screen with nothing of yours on it and the tile is the point of
 * it. The moment there is one real trip the tile is the least interesting
 * card in the row and goes to the end, where "add another" belongs.
 */
export function tileLeads(trips = []) {
  return ownTrips(trips).length === 0
}
