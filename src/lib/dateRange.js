// How a trip's dates are said out loud.
//
// "22 January 2024 – 25 January 2024" is how a database prints a range, not
// how anybody says one. The month and the year are the same at both ends, so
// saying them twice is noise sitting in the largest type on the screen. A
// person says "22–25 January 2024", and only repeats the month when it
// actually changes.
//
// There were three copies of this, in TripRecap, WorldTab and PhotosTab,
// which is how the recap ended up with the long form and the cards with a
// short one that had the same duplication in miniature ("22 Jan – 25 Jan").
// One function, two lengths.
//
// Dates arrive as 'YYYY-MM-DD' with no time and no zone. `new Date(...)` on
// that string is midnight UTC, and formatting it in local time moves it back
// a day for anybody west of Greenwich — a trip starting on the 22nd shown as
// the 21st in New York. Everything here is built and read in UTC so the day
// that comes out is the day that went in.

const LONG = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
const SHORT = { day: 'numeric', month: 'short', timeZone: 'UTC' }

function parts(ymd) {
  const [y, m, d] = String(ymd ?? '').split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m, d, at: new Date(Date.UTC(y, m - 1, d)) }
}

const say = (p, opt) => p.at.toLocaleDateString('en-GB', opt)

/**
 * A trip's dates, with nothing said twice.
 *
 *   22–25 January 2024          same month, same year
 *   28 January – 3 February 2024   same year
 *   28 December 2023 – 3 January 2024
 *   22 January 2024             one day, or no end date
 *
 * @param trip   anything with start_date and (optionally) end_date
 * @param long   the recap's full form with the year; false is the card form
 * @param empty  what to say when there is no start date at all
 */
export function spanOf(trip, { long = false, empty = '' } = {}) {
  const a = parts(trip?.start_date)
  if (!a) return empty
  const b = parts(trip?.end_date)
  const opt = long ? LONG : SHORT

  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) return say(a, opt)

  // Same month and year: only the two day numbers differ, so that is all
  // the first half needs to be. "22 – 25 January 2024".
  if (a.y === b.y && a.m === b.m) return `${a.d} – ${say(b, opt)}`

  // Same year, different months. The long form still carries one year, at
  // the end, where it belongs. The short form never had a year.
  if (a.y === b.y && long) {
    return `${say(a, { day: 'numeric', month: 'long', timeZone: 'UTC' })} – ${say(b, opt)}`
  }

  return `${say(a, opt)} – ${say(b, opt)}`
}
