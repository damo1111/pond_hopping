import { groupTrips } from './tripGroups.js'

// A trip is one object moving through states, not four kinds of thing:
// somewhere you fancy → something you're planning → the days themselves →
// history. Home should show you the state you're actually in, which means
// it has to be able to work out which that is.
//
// Derived from dates alone. trip_meta carries no status column, and even if
// it did, a date is harder to leave stale than a flag someone has to
// remember to flip the morning they fly home.

const day = (d) => (d ? String(d).slice(0, 10) : null)

/**
 * How long a trip with no end date is assumed to run.
 *
 * `end_date || start_date` made an unclosed trip one day long, so a trip
 * somebody was on stopped being 'live' the morning of day two and dropped
 * into Been there — while they were still on it. And an unclosed trip is
 * not an edge case: it is the ordinary state of a trip you are having,
 * because the end date is the thing you fill in when you get home.
 *
 * A hundred and twenty days, which is not a new number: photoRouting.js has
 * used exactly this for open-ended trips since it was written, and
 * whereYouAre.datesOf runs an unclosed trip to today for the same reason.
 * Three modules, one convention, rather than each inventing its own.
 *
 * Long enough for a genuinely long trip, short enough that one left open in
 * 2019 stops claiming to be happening.
 */
export const OPEN_ENDED_DAYS = 120

const DAY = 86400000

// 'live' | 'upcoming' | 'someday' | 'past'
export function tripPhase(trip, today = new Date()) {
  const now = day(today.toISOString())
  const start = day(trip.start_date)

  // "Peru, one day" is a real state, not a broken trip.
  if (!start) return 'someday'

  const end =
    day(trip.end_date) ||
    day(new Date(Date.parse(`${start}T00:00:00Z`) + OPEN_ENDED_DAYS * DAY).toISOString())

  if (end && end < now) return 'past'
  if (start > now) return 'upcoming'
  return 'live'
}

// Home's sections, in the order they should read. Empty ones are dropped by
// the caller — a section heading over nothing is worse than no heading.
//
// Past keeps sort_order, which is curated by hand and groups into chapters.
// Upcoming is sorted by date instead: nobody hand-orders the future, and
// "which is next" is the only question being asked of that row. Someday
// trails the upcoming ones — same forward-looking half of the app, but with
// nothing to count down to.
export function sectionTrips(tripMeta, today = new Date()) {
  const by = { live: [], upcoming: [], someday: [], past: [] }
  for (const t of tripMeta) by[tripPhase(t, today)].push(t)

  by.upcoming.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))

  return [
    { id: 'live', label: 'Right now', items: by.live.map((trip) => ({ type: 'trip', trip })) },
    {
      id: 'upcoming',
      label: 'Coming up',
      items: [...by.upcoming, ...by.someday].map((trip) => ({ type: 'trip', trip })),
    },
    // Chapters ("2024 Gap Year") only ever collapse history, so grouping
    // stays where it always was rather than being applied to all four.
    { id: 'past', label: 'Been there', items: groupTrips(by.past) },
  ].filter((s) => s.items.length)
}
