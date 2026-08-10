// Piecing a trip together from photographs taken two years ago.
//
// The pipeline, and why each step is where it is:
//
//   1. Cluster the photographs into days and stops.  Free, arithmetic.
//   2. Ask what is at each stop.                     One lookup per stop.
//   3. Decide, from distance and dwell time.         Free, arithmetic.
//   4. Where that cannot decide, look at a photo.    A few calls per trip.
//   5. Tell the day, in the names that came back.    Free.
//
// The shape matters more than any one step. Steps 1, 3 and 5 cost nothing
// and do most of the work; step 2 is a handful of calls; step 4 — the only
// one that looks at what is *in* a picture — runs solely where the
// coordinates have genuinely run out of answers. For Rome that is a few
// stops out of twenty, not three hundred photographs.
//
// The alternative shape, asking every photograph what it is, costs a
// hundred times as much to arrive at a worse answer: a model looking at a
// picture of a doorway with no candidate list will confidently name a
// famous doorway.

import { daysFrom } from './photoDays.js'
import { askWith, pickPlace } from './placePick.js'
import { RECONSTRUCTED, tellDay, titleDay } from './narrate.js'

/** Below this the model was guessing at the picture and we keep the gap. */
export const TRUST_PHOTO = 0.6

export const stopKey = (dayDate, i) => `${dayDate}#${i}`

/**
 * Every stop across a trip, as the flat list the lookup endpoint wants.
 * Stops with no coordinates are left out: there is nothing to ask about.
 */
export function stopsToName(days = []) {
  const out = []
  for (const day of days)
    day.stops.forEach((stop, i) => {
      if (stop.lat == null || stop.lon == null) return
      out.push({ key: stopKey(day.date, i), lat: stop.lat, lon: stop.lon, day: day.date, i, stop })
    })
  return out
}

/**
 * What the candidates settle and what they cannot.
 *
 * @param named  key → candidates, from /api/name-places
 * @returns { names, ask }
 *   names — key → the place, where the numbers were enough
 *   ask   — the stops worth showing a photograph to, with their shortlist
 */
export function sift(days = [], named = {}) {
  const names = {}
  const ask = []

  for (const { key, stop, day, i } of stopsToName(days)) {
    const { verdict, place, shortlist } = pickPlace(stop, named[key] ?? [])
    if (verdict === 'settled') names[key] = place.name
    else if (verdict === 'ambiguous') ask.push({ key, day, i, stop, shortlist, photos: askWith(stop) })
  }

  return { names, ask }
}

/** Names keyed by stop → names keyed by index, for one day. */
export function namesForDay(day, names = {}) {
  const out = {}
  day.stops.forEach((_, i) => {
    const n = names[stopKey(day.date, i)]
    if (n) out[i] = n
  })
  return out
}

/** A day → the journal entry it becomes, told in the names that were found. */
export function entryFor(day, trip = {}, names = {}) {
  const mine = namesForDay(day, names)
  return {
    trip_id: trip.id ?? null,
    entry_date: day.date,
    day_number: day.day_number,
    title: titleDay(day, mine),
    note: `${tellDay(day, mine)}\n\n${RECONSTRUCTED}`,
    lat: day.lat,
    lon: day.lon,
    // The place that held the day, which is the useful thing to have in a
    // column called city even when it is a landmark rather than a city.
    city: firstNamed(day, mine),
    mood: null,
    tags: ['reconstructed'],
  }
}

function firstNamed(day, mine) {
  const longest = [...(day.stops ?? [])]
    .map((s, i) => ({ minutes: s.minutes, name: mine[i] }))
    .filter((s) => s.name)
    .sort((a, b) => b.minutes - a.minutes)[0]
  return longest?.name ?? null
}

/** How much this trip will cost to piece together, before spending it. */
export function priceIt(days = [], ask = []) {
  return {
    days: days.length,
    stops: stopsToName(days).length,
    lookups: stopsToName(days).length,
    photosLookedAt: ask.reduce((n, a) => n + a.photos.length, 0),
    ambiguous: ask.length,
  }
}

export { daysFrom, tellDay, titleDay, RECONSTRUCTED }
