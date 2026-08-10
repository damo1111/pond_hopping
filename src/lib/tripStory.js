// Piecing a trip together from what the app already knows.
//
// The order matters, and getting it wrong is what made the first two
// attempts worthless:
//
//   1. What is certain.   Flights and runs, already in the database.
//   2. Where you stopped. Photographs, segmented by time not distance.
//   3. What those were.   One lookup per place you actually stayed.
//   4. Which of several.  A photograph, only where the coordinates cannot.
//   5. Say the day.       Known things first, photographs filling gaps.
//
// The version before this started at step 2 and never did step 1, so a day
// that began with a 21.4 km run through Rome — in the runs table, with the
// route, the pace and the climb — was reported as "The evening at La
// Cenatio Rotunda". The best fact about the day was already local and
// nothing looked at it.
//
// Steps 1, 2 and 5 cost nothing. Step 3 runs on the handful of places you
// stayed rather than every hundred and fifty metres you crossed, which is
// what turned twenty lookups a day into four. Step 4 is the only one that
// looks at what is in a picture, and only where several real places share
// one GPS fix.

import { knownOn, segment, worthNaming } from './dayShape.js'
import { askWith, pickPlace } from './placePick.js'
import { RECONSTRUCTED, tellDay, titleDay } from './tellIt.js'
import { builtFrom } from './staleStory.js'
import { zoneFor } from './localTime.js'

/** Below this the model was guessing at the picture and we keep the gap. */
export const TRUST_PHOTO = 0.6

export const stopKey = (dayDate, i) => `${dayDate}#${i}`

/**
 * A trip's photographs as days, each made of the times you stopped.
 *
 * Keyed on taken_on, which the uploader read off the camera in the phone's
 * own timezone — safer than re-deriving it from a UTC instant, which is how
 * a photograph taken at 1am in Tokyo ends up filed under the day before.
 */
export function daysFrom(photos = [], trip = {}, { runs = [], flights = [] } = {}) {
  const byDay = new Map()
  for (const p of photos) {
    if (!p?.taken_on) continue
    if (!byDay.has(p.taken_on)) byDay.set(p.taken_on, [])
    byDay.get(p.taken_on).push(p)
  }

  // A day can be a real day of the trip with no photographs on it at all —
  // a travel day where nobody took a picture still has the flight.
  for (const f of flights) {
    const d = String(f?.dep_time ?? '').slice(0, 10)
    if (d && !byDay.has(d)) byDay.set(d, [])
  }
  for (const r of runs) if (r?.run_date && !byDay.has(r.run_date)) byDay.set(r.run_date, [])

  const dates = [...byDay.keys()].sort()
  const start = trip.start_date || dates[0]

  return dates.map((date) => {
    const shots = byDay.get(date)
    const segments = segment(shots)
    const located = shots.filter((p) => p.lat != null)
    return {
      date,
      day_number: start
        ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1
        : null,
      photos: shots,
      segments,
      known: knownOn(date, { runs, flights }),
      lat: located.length ? located.reduce((s, p) => s + p.lat, 0) / located.length : null,
      lon: located.length ? located.reduce((s, p) => s + p.lon, 0) / located.length : null,
      from: segments[0]?.from ?? null,
      to: segments[segments.length - 1]?.to ?? null,
    }
  })
}

/**
 * Every located segment of every day, as the flat list the lookup endpoint
 * wants.
 *
 * This used to return only the segments that passed STAYED_MINUTES, and
 * that decision was the reason the whole thing had nothing to say. Rome
 * came out as 31 segments across four days and the writer was handed 7:
 * twenty-four places thrown away, including twenty-three photographs in ten
 * minutes on the afternoon of the 24th, which is somebody standing in front
 * of something remarkable, filed as "passing through". The discarded ones
 * had no names either, because a lookup was only ever paid for on a segment
 * that had already survived the cut. Starved twice over.
 *
 * Naming them all costs about two dozen extra lookups for a four-day trip,
 * and the cache is keyed on the coordinate, so a hotel you return to every
 * night is free after the first night. A quota was deciding the shape of
 * the story, which is the wrong way round.
 *
 * `stayed` still matters — it is what separates an evening somewhere from a
 * photograph taken on the way past, and the writer is told which is which.
 * It just no longer decides what gets a name.
 */
export function placesToName(days = []) {
  const out = []
  for (const day of days)
    day.segments.forEach((s, i) => {
      if (s.lat == null) return
      out.push({ key: stopKey(day.date, i), lat: s.lat, lon: s.lon, day: day.date, i, stop: s })
    })
  return out
}

/** How many neighbours to hand over when nothing settles. Enough for the
 *  writer to say where somebody was; not so many it reads as a directory. */
export const NEIGHBOURS = 3

/**
 * What the candidates settle, what only a photograph can, and what stays a
 * neighbourhood rather than a name.
 *
 * Only a segment somebody stayed at is worth a photograph. Sending one for
 * every place walked past would be two dozen image calls a trip to settle
 * questions nobody asked — a picture taken in eleven seconds on the way
 * somewhere does not need its restaurant identified.
 *
 * But an unsettled place is still worth reporting. "Somewhere among Piazza
 * Trilussa and the Fontanone" is a real sentence about a real morning, and
 * it is the difference between a day with eleven moments in it and a day
 * with three.
 */
export function sift(days = [], named = {}) {
  const names = {}
  const near = {}
  const ask = []

  for (const { key, stop, day, i } of placesToName(days)) {
    const candidates = named[key] ?? []
    const { verdict, place, shortlist } = pickPlace(stop, candidates)
    if (verdict === 'settled') {
      names[key] = place.name
      continue
    }
    if (verdict === 'ambiguous' && stop.stayed) {
      ask.push({ key, day, i, stop, shortlist, photos: askWith(stop) })
      continue
    }
    const around = (shortlist.length ? shortlist : candidates).slice(0, NEIGHBOURS)
    if (around.length) near[key] = around.map((c) => c.name)
  }

  return { names, near, ask }
}

export function namesForDay(day, names = {}) {
  const out = {}
  day.segments.forEach((_, i) => {
    const n = names[stopKey(day.date, i)]
    if (n) out[i] = n
  })
  return out
}

/** The same, for the places that never settled on one name. */
export function nearForDay(day, near = {}) {
  const out = {}
  day.segments.forEach((_, i) => {
    const n = near[stopKey(day.date, i)]
    if (n?.length) out[i] = n
  })
  return out
}

/** A day → the journal entry it becomes. */
export function entryFor(day, trip = {}, names = {}, zone = null) {
  const mine = namesForDay(day, names)
  return {
    trip_id: trip.id ?? null,
    entry_date: day.date,
    day_number: day.day_number,
    title: titleDay(day, mine, day.known),
    note: `${tellDay(day, mine, day.known, zone)}\n\n${RECONSTRUCTED}`,
    lat: day.lat,
    lon: day.lon,
    city: longestNamed(day, mine),
    mood: null,
    tags: ['reconstructed'],
    built_from: builtFrom({ photos: day.photos, stops: day.segments }),
  }
}

function longestNamed(day, mine) {
  const best = [...(day.segments ?? [])]
    .map((s, i) => ({ minutes: s.minutes, name: mine[i] }))
    .filter((s) => s.name)
    .sort((a, b) => b.minutes - a.minutes)[0]
  return best?.name ?? null
}

/** What this trip will cost to piece together, before spending it. */
export function priceIt(days = [], ask = []) {
  const stops = placesToName(days).length
  return {
    days: days.length,
    stops,
    lookups: stops,
    photosLookedAt: ask.reduce((n, a) => n + a.photos.length, 0),
    ambiguous: ask.length,
  }
}

/** The trip's own clocks. The photographs say where; the flights name it. */
export function zoneOf(days = [], flights = []) {
  const located = days.filter((d) => d.lon != null)
  const lon = located.length ? located.reduce((s, d) => s + d.lon, 0) / located.length : null
  return zoneFor({ flights, lon, when: days.find((d) => d.from)?.from ?? null })
}

export { tellDay, titleDay, RECONSTRUCTED }
