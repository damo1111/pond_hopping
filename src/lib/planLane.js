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
 * How far ahead the example trip is kept, and why it is this number.
 *
 * The date itself is written by keep_the_example_ahead(), the hourly job in
 * migrations_2026_08_the_example_is_always_five_days_out.sql. The number is
 * repeated here because it was chosen against countdown()'s buckets below
 * and belongs beside them: change the buckets and this is what has to be
 * re-checked.
 *
 * The buckets are not equally good. 2–6 gives "In 4 days" — concrete and
 * imminent, which is the whole point of an example built to demonstrate
 * planning. 7–13 gives "Next week", which is vague. 1 gives "Tomorrow",
 * which reads as a crisis on a trip with two nights still unbooked.
 *
 * Five rather than six because the job runs on UTC and the readers do not.
 * One stored date is a day further out to the west and a day nearer to the
 * east, so five is read as four, five or six — all three inside the strong
 * bucket. Six would say "Next week" to everyone west of Greenwich for part
 * of every day.
 */
export const EXAMPLE_DAYS_OUT = 5

/** The most a reader's own calendar day can differ from the job's UTC one. */
export const TIMEZONE_SLIP = 1

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
//
// This used to return inventory: 2 flights, 2 beds, 18 to do. Three counts
// with no denominator, on the one card in the app whose whole job is what
// still needs doing. "2 beds" on a seven-night trip could be nearly finished
// or barely started and the card gave no way to tell, so it read as a row of
// numbers rather than as a state of affairs.
//
// Every denominator here is already known. The nights come from the trip's
// own dates, hotels carry a date range, and a day with nothing on it is a day
// with no event. Same data, turned round to say what is missing.
export function readiness(events = [], trip = null) {
  const of = (kind) => events.filter((e) => e.kind === kind)
  const flights = of('flight')
  const doing = events.filter((e) => e.kind === 'activity' || e.kind === 'place')
  const nights = nightsOf(trip)
  const covered = nightsCovered(of('hotel'), trip)

  return [
    { key: 'flights', label: 'flights', have: flights.length },
    // "5 of 7 nights" rather than "2 beds": a bed is a booking, a night is
    // the thing that either has one or does not.
    nights
      ? { key: 'beds', label: `of ${nights} nights`, have: covered, of: nights, short: nights - covered }
      : { key: 'beds', label: 'beds', have: of('hotel').length },
    { key: 'doing', label: 'to do', have: doing.length },
  ]
}

/** How many nights the trip is, from its own dates. Nights, not days: six
 *  nights is what a hotel is booked for across a seven-day trip. */
export function nightsOf(trip) {
  const from = trip?.start_date
  const to = trip?.end_date
  if (!from || !to) return 0
  const a = new Date(`${String(from).slice(0, 10)}T00:00:00`)
  const b = new Date(`${String(to).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.max(0, Math.round((b - a) / day))
}

/** Nights with a bed under them, counted rather than assumed.
 *
 *  A hotel runs from event_date to end_date, and two of them can overlap or
 *  leave a hole in the middle — which is exactly the case worth catching, and
 *  the one a count of bookings cannot see. */
export function nightsCovered(hotels = [], trip = null) {
  const nights = nightsOf(trip)
  if (!nights) return 0
  const start = new Date(`${String(trip.start_date).slice(0, 10)}T00:00:00`)
  const slept = new Set()
  for (const h of hotels) {
    const from = h?.event_date
    if (!from) continue
    const a = new Date(`${String(from).slice(0, 10)}T00:00:00`)
    // A hotel with no end_date is one night, which is the safe reading: it
    // never claims to cover more of the trip than it was told about.
    const b = h.end_date ? new Date(`${String(h.end_date).slice(0, 10)}T00:00:00`) : new Date(a.getTime() + day)
    for (let t = a.getTime(); t < b.getTime(); t += day) {
      const n = Math.round((t - start.getTime()) / day)
      if (n >= 0 && n < nights) slept.add(n)
    }
  }
  return slept.size
}

/** The days of the trip with nothing on them at all.
 *
 *  Returned as dates rather than a count, because "Saturday and Sunday" is a
 *  thing somebody acts on and "2 empty days" is not. */
export function emptyDays(events = [], trip = null) {
  const from = trip?.start_date
  const to = trip?.end_date
  if (!from || !to) return []
  const start = new Date(`${String(from).slice(0, 10)}T00:00:00`)
  const end = new Date(`${String(to).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  const busy = new Set(events.map((e) => String(e?.event_date ?? '').slice(0, 10)).filter(Boolean))
  const out = []
  for (let t = start.getTime(); t <= end.getTime(); t += day) {
    const iso = new Date(t).toISOString().slice(0, 10)
    if (!busy.has(iso)) out.push(iso)
  }
  return out
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
      readiness: readiness(own, t),
      nights: nightsOf(t),
      unbooked: Math.max(0, nightsOf(t) - nightsCovered(own.filter((e) => e.kind === 'hotel'), t)),
      empty: emptyDays(own, t),
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
