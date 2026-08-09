// Matching a cancellation email to the thing it cancels.
//
// The extraction step can now mark an item `action: 'cancel'` instead of
// skipping it, which raises the question this file answers: which of the
// events already on the trip does it mean?
//
// Getting this wrong deletes something somebody booked, so the bias is
// heavily towards refusing. Every rule below must identify exactly one
// candidate; two candidates is treated as no match, and the review screen
// says so rather than guessing. A cancellation nobody acts on is a mild
// annoyance. A deleted flight somebody is still booked on is not.

// "Booking reference Z7NFKX", "Confirmation code: HM3BCPYMNX", "PNR ABC123".
// Six alphanumerics with at least one digit and one letter is the shape of
// every airline record locator and most hotel confirmations; requiring both
// keeps ordinary words like "LONDON" or "FRIDAY" out.
const REF = /\b(?=[A-Z0-9]{6,10}\b)(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,10}\b/g

export function refs(text) {
  return new Set(String(text ?? '').toUpperCase().match(REF) ?? [])
}

// "AY1336", "BA 504", "TP1363". Same shape airlineTails already recognises:
// two letters, or a letter and a digit in either order, then 1–4 digits.
const FLIGHT = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4}[A-Z]?)\b/g

export function flightNumbers(text) {
  const out = new Set()
  for (const m of String(text ?? '').toUpperCase().matchAll(FLIGHT)) out.add(m[1] + m[2])
  return out
}

function overlap(a, b) {
  for (const x of a) if (b.has(x)) return true
  return false
}

/** Everything an item or an event says about itself, as one string. */
function haystack(o) {
  return [o?.title, o?.note, o?.detail?.booking_ref, o?.detail?.flight_number, o?.detail?.confirmation]
    .filter(Boolean)
    .join(' ')
}

function sole(candidates) {
  return candidates.length === 1 ? candidates[0] : null
}

/**
 * The single event a cancellation refers to, or null when it is not certain.
 *
 * Tried in descending order of confidence — a shared booking reference is
 * near-proof, a shared flight number is strong, and same-kind-same-day is a
 * last resort that still has to be unique to count.
 *
 * @param {object} item   an extracted item with action === 'cancel'
 * @param {Array}  events planned_events rows already on the trip
 */
export function matchEvent(item, events = []) {
  if (!item) return null
  const pool = events.filter((e) => e && (!item.kind || !e.kind || e.kind === item.kind))
  const mine = haystack(item)

  const myRefs = refs(mine)
  const myFlights = flightNumbers(item?.title)

  if (myRefs.size) {
    const hit = sole(pool.filter((e) => overlap(myRefs, refs(haystack(e)))))
    if (hit) return hit
  }
  if (myFlights.size) {
    const hit = sole(pool.filter((e) => overlap(myFlights, flightNumbers(`${e?.title ?? ''} ${e?.detail?.flight_number ?? ''}`))))
    if (hit) return hit
  }

  // The email named a reference or a flight and neither is on this trip.
  // That is not a weak match, it is evidence the cancellation is for
  // something else — so stop, rather than falling through to the date and
  // deleting whatever else happened that day.
  if (myRefs.size || myFlights.size) return null

  // Nothing identifying at all. Same kind, same day, and only one of them —
  // true of most single-hotel, single-dinner days, and false of exactly the
  // days where a wrong guess would hurt.
  if (!item.event_date) return null
  return sole(pool.filter((e) => e.event_date === item.event_date))
}

/**
 * Pairs every cancellation in a set of items with what it removes.
 * Items that match nothing come back with `event: null`, which the review
 * screen shows as "couldn't find this" rather than silently dropping.
 */
export function planCancellations(items = [], events = []) {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item?.action === 'cancel')
    .map(({ item, index }) => ({ index, item, event: matchEvent(item, events) }))
}
