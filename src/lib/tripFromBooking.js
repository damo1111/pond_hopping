// A trip, worked out from the bookings somebody pasted in.
//
// Pasting a confirmation used to require a trip to paste it into, which is
// backwards: the confirmation is the thing that knows where you are going and
// when. So the route from the front door — "Paste a confirmation" — used to
// close the sheet and drop somebody on the Plan tab to go and make a trip
// first, and then find the paste box inside it. David, 12 August: "takes a
// hopper to the trip plan screen. this is wrong."
//
// This is the arithmetic in between: given the items the extractor found,
// what trip are they? Kept out of the component and tested, because "the
// dates are wrong" is the one failure that quietly ruins a trip — every day
// map, every photo match and every flight lookup keys off the window.

/** Sorts nulls last rather than first, which is what a plain compare does. */
const dated = (items) => items.map((i) => i?.event_date).filter(Boolean).sort()

/**
 * The last day anything touches.
 *
 * A hotel's end_date is the checkout, which is a day the trip is still
 * happening; a flight has no end_date at all. Taking the max of both columns
 * rather than only event_date is the difference between a five-night stay
 * ending on the day you arrive and ending on the day you leave.
 */
function lastDay(items) {
  const ends = items
    .flatMap((i) => [i?.end_date, i?.event_date])
    .filter(Boolean)
    .sort()
  return ends[ends.length - 1] ?? null
}

/**
 * What to call it.
 *
 * The city named most often, because a confirmation for a week in Rome says
 * Rome four or five times and says the airport it left from once. Ties go to
 * whichever was seen first, so a two-city trip is named after the one you
 * arrive in rather than by whichever way a Map happened to iterate.
 */
export function nameFor(items, when = null) {
  const seen = new Map()
  for (const i of items) {
    const city = (i?.city || i?.detail?.arr_city || '').trim()
    if (!city) continue
    seen.set(city, (seen.get(city) ?? 0) + 1)
  }
  let best = null
  for (const [city, n] of seen) {
    if (!best || n > best.n) best = { city, n }
  }
  if (best) return best.city
  // Nothing named a place — a train ticket, a restaurant with no city on it.
  // A date is still enough to tell two of these apart in a list, which is all
  // a title has to do until somebody renames it.
  if (when) {
    return `Trip from ${new Date(`${when}T00:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })}`
  }
  return 'New trip'
}

export function slugFor(title, stamp) {
  const base = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `${base || 'trip'}-${stamp.toString(36)}`
}

/**
 * The trip these bookings describe, or null if they describe nothing datable.
 *
 * @param items  what the extractor handed back
 * @param stamp  something to make the slug unique; passed in rather than read
 *               from the clock so this can be tested
 */
export function tripShape(items, stamp = 0) {
  const list = Array.isArray(items) ? items.filter(Boolean) : []
  // A cancellation is a booking that is not happening. It should not be what
  // decides when a trip starts — a cancelled outbound would drag the window
  // back to a day nobody travels.
  const live = list.filter((i) => i.action !== 'cancel')
  const use = live.length ? live : list

  const starts = dated(use)
  if (!starts.length) return null

  const start = starts[0]
  const end = lastDay(use)
  const title = nameFor(use, start)
  return {
    title,
    slug: slugFor(title, stamp),
    start_date: start,
    // A single-day booking is a single-day trip, not one with no end.
    end_date: end && end >= start ? end : start,
    countries: [],
  }
}
