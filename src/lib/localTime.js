// A Roman day, told in Roman time.
//
// The reconstruction rendered every time with toLocaleTimeString and no
// timezone, which means the *reader's* timezone. Read from Melbourne, a
// Roman morning that ran 07:06 to 21:14 came out as "the evening, from
// 17:09" and ended "around 3:10" — the day apparently running backwards,
// every clock time eleven hours out, and "the small hours" attached to an
// afternoon at Heathrow.
//
// The app already had the answer: AIRPORT_TZ maps every airport in the
// database to an IANA zone, and flight times have always been rendered
// local to their airport. The story just wasn't using it.
//
// Where there is no flight to ask, longitude answers well enough. Fifteen
// degrees is an hour, and being an hour out on whether something was "the
// morning" is a rounding error next to being eleven out.

import { AIRPORT_TZ } from './airportTz.js'

/** Crude, and completely sufficient: 15° of longitude is one hour. Ignores
 *  political borders and daylight saving, which move the answer by an hour
 *  at most and never turn an afternoon into the small hours. */
export function offsetFromLongitude(lon) {
  if (!Number.isFinite(lon)) return null
  return Math.round(lon / 15)
}

/** What a named zone was actually offset by on a given day — which is how
 *  daylight saving gets handled without a table of when it starts. */
export function offsetOfZone(zone, when) {
  try {
    const at = new Date(when || Date.now())
    const there = new Date(at.toLocaleString('en-US', { timeZone: zone }))
    const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
    return Math.round((there - utc) / 3600000)
  } catch {
    return null
  }
}

/**
 * Where this trip's clocks were.
 *
 * The photographs decide. They were taken where the person was, which is
 * the question — and the first version of this asked the flights instead,
 * took the arrival airport, and confidently returned Europe/London for a
 * trip to Rome, because the last flight of a holiday lands at home.
 *
 * The airports only get to name the answer the coordinates already gave.
 * A trip whose photographs sit an hour east of Greenwich, and which touched
 * an airport in a zone that was an hour east that day, is in that zone —
 * and a named zone is worth having over a bare offset because it knows
 * about daylight saving.
 *
 * @returns an IANA zone name, a number of hours, or null
 */
export function zoneFor({ flights = [], lon = null, when = null } = {}) {
  const zones = [
    ...new Set(
      flights
        .flatMap((f) => [f?.arr_airport, f?.dep_airport])
        .map((code) => AIRPORT_TZ[code])
        .filter(Boolean)
    ),
  ]

  const guess = offsetFromLongitude(lon)
  if (guess == null) return zones.length === 1 ? zones[0] : null

  // Matched on standard time, not on the offset in force that day.
  // Longitude describes where a place is, which is what standard time is
  // for; daylight saving is a political hour added on top and would make
  // Rome in July look like London. Standard time is the smaller of the
  // two, which is true north and south of the equator — Melbourne's
  // summer is January and this still picks +10.
  return zones.find((z) => standardOffset(z) === guess) ?? guess
}

/** The zone's offset with no daylight saving on it: the lesser of its two. */
export function standardOffset(zone) {
  const jan = offsetOfZone(zone, '2024-01-15T12:00:00Z')
  const jul = offsetOfZone(zone, '2024-07-15T12:00:00Z')
  if (jan == null || jul == null) return null
  return Math.min(jan, jul)
}

function shifted(iso, zone) {
  const at = new Date(iso)
  if (typeof zone === 'string') return { at, tz: zone }
  const hours = Number.isFinite(zone) ? zone : 0
  return { at: new Date(at.getTime() + hours * 3600000), tz: 'UTC' }
}

/** "07:06", in the trip's time rather than the reader's. */
export function clockIn(iso, zone) {
  if (!iso) return ''
  const { at, tz } = shifted(iso, zone)
  return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
}

/** The hour of the day, there. 0–23. */
export function hourIn(iso, zone) {
  if (!iso) return null
  const { at, tz } = shifted(iso, zone)
  return Number(at.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }))
}
