// Which slice of an inbox could possibly hold this trip's bookings.
//
// The scan asked for `newer_than:14m` — the last fourteen months,
// regardless of when the trip was. Rome was January 2024, which is thirty
// months ago, so the search could not see a single one of its booking
// emails. The feature was not broken; it was pointed at the wrong dates,
// and would have reported "nothing found" forever.
//
// A booking confirmation arrives when you BOOK, which is often months
// before you travel and occasionally the morning of. So the window runs
// from a year before the trip starts to a few days after it ends: wide
// enough for the flights somebody booked eleven months out, tight enough
// that a three-day trip is not a search of the whole inbox.

/** How far before a trip a booking might have been made. */
export const BOOKED_BEFORE_MONTHS = 12

/** Confirmations, receipts and "how was your stay" all land after. */
export const SETTLED_AFTER_DAYS = 10

const pad = (n) => String(n).padStart(2, '0')
const gdate = (d) => `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`

/**
 * `after:` and `before:` for one trip, in Gmail's own date format.
 *
 * @returns { after, before, query } or null when the trip has no dates
 */
export function windowFor(trip = {}) {
  const start = trip.start_date
  if (!start) return null
  const end = trip.end_date || start

  const from = new Date(`${start}T00:00:00Z`)
  from.setUTCMonth(from.getUTCMonth() - BOOKED_BEFORE_MONTHS)

  const to = new Date(`${end}T00:00:00Z`)
  to.setUTCDate(to.getUTCDate() + SETTLED_AFTER_DAYS)

  const after = gdate(from)
  const before = gdate(to)
  return { after, before, query: `after:${after} before:${before}` }
}

/** The senders and subjects worth looking at, in that window. */
export function queryFor(trip = {}, extra = '') {
  const win = windowFor(trip)
  return [
    // Dated first, because without it this is a search of everything.
    win ? win.query : 'newer_than:14m',
    '(',
    'from:airbnb OR from:booking.com OR from:expedia OR from:hotels.com OR from:marriott OR from:hilton OR from:ihg OR from:accor',
    'OR from:opentable OR from:resy OR from:sevenrooms OR from:thefork',
    'OR from:srilankan OR from:britishairways OR from:qantas OR from:ba.com OR from:easyjet OR from:ryanair',
    'OR from:trainline OR from:nationalrail',
    'OR subject:(confirmation OR itinerary OR reservation OR "e-ticket" OR "booking reference" OR "booking confirmed" OR receipt OR "you\'re all set" OR reserved)',
    ')',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}
