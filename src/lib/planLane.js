// Plan was two screens stacked: "Trips in the works", then "Wishlist", each
// with its own heading and its own dashed button. But they are the same
// spectrum — the lifecycle this app already runs on is idea → plan → live →
// history, and the first two of those were being shown as separate rooms.
//
// This merges them into one lane: Someday, Planning, Booked. Nearest departure
// first, because the thing you are about to do outranks the thing you might
// do one day.

export const STAGES = [
  { id: 'booked', label: 'Booked' },
  { id: 'planning', label: 'Planning' },
  { id: 'someday', label: 'Someday' },
]

const day = 86400000

/** Whole days from today to a date, in the reader's own timezone. */
export function daysUntil(date, today = new Date()) {
  if (!date) return null
  const then = new Date(`${String(date).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(then.getTime())) return null
  const now = new Date(today)
  now.setHours(0, 0, 0, 0)
  return Math.round((then - now) / day)
}

/**
 * The line a planning screen exists to print. Anticipation is the whole
 * emotional content of this screen, so it gets said in words rather than
 * left as a date the reader has to subtract from today.
 */
export function countdown(trip, today = new Date()) {
  const start = daysUntil(trip?.start_date, today)
  if (start === null) return { text: 'Dates to come', soon: false }
  const end = daysUntil(trip?.end_date, today)
  // Departing today is anticipation, not "you are already on it" — the day
  // hasn't happened yet, which is exactly what the reader wants to be told.
  if (start === 0) return { text: 'Today', soon: true }
  if (start < 0 && (end === null || end >= 0)) return { text: 'Happening now', soon: true, live: true }
  if (start < 0) return { text: 'Already been', soon: false, past: true }
  if (start === 1) return { text: 'Tomorrow', soon: true }
  if (start < 7) return { text: `In ${start} days`, soon: true }
  if (start < 14) return { text: 'Next week', soon: true }
  return { text: `In ${start} days`, soon: start < 60, days: start }
}

// A trip is "booked" once the things that cost money exist. Not a fraction of
// items ticked off — you can plan twenty restaurants and still have no way of
// getting there.
export function readiness(events = []) {
  const of = (kind) => events.filter((e) => e.kind === kind)
  const flights = of('flight')
  const beds = of('hotel')
  const doing = events.filter((e) => e.kind === 'activity' || e.kind === 'place')
  return [
    { key: 'flights', label: 'flights', have: flights.length },
    { key: 'beds', label: 'beds', have: beds.length },
    { key: 'doing', label: 'to do', have: doing.length },
  ]
}

export function isBooked(events = []) {
  return events.some((e) => e.kind === 'flight') && events.some((e) => e.kind === 'hotel')
}

/**
 * One ordered lane out of the two lists that used to be two sections.
 *
 * @returns Array<{ id, stage, kind: 'trip'|'wish', title, ... }>
 */
export function planLane({ trips = [], wishlist = [], events = [], today = new Date() } = {}) {
  const eventsFor = (id) => events.filter((e) => e.trip_id === id)

  const tripRows = trips.map((t) => {
    const own = eventsFor(t.id)
    return {
      id: t.id,
      kind: 'trip',
      stage: isBooked(own) ? 'booked' : 'planning',
      title: t.title,
      trip: t,
      events: own,
      countdown: countdown(t, today),
      readiness: readiness(own),
      sortAt: daysUntil(t.start_date, today),
    }
  })

  // A wishlist item already promoted to a trip is that trip; showing it twice
  // is the same duplication the two-section layout was built on.
  const promoted = new Set(trips.map((t) => t.id))
  const wishRows = wishlist
    .filter((w) => !(w.trip_id && promoted.has(w.trip_id)))
    .map((w) => ({
      id: w.id,
      kind: 'wish',
      stage: 'someday',
      title: w.title,
      wish: w,
      countdown: { text: 'Someday', soon: false },
      sortAt: null,
    }))

  const stageRank = (s) => STAGES.findIndex((x) => x.id === s)
  return [...tripRows, ...wishRows].sort((a, b) => {
    const s = stageRank(a.stage) - stageRank(b.stage)
    if (s) return s
    // Dateless trips sit behind dated ones rather than jumping the queue.
    if (a.sortAt === null && b.sortAt === null) return 0
    if (a.sortAt === null) return 1
    if (b.sortAt === null) return -1
    return a.sortAt - b.sortAt
  })
}
