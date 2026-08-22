// A day, as time rather than as distance.
//
// The first version started a new stop every 150 metres. Walking central
// Rome crosses 150 metres every two minutes, so a wander became twenty
// "stops" and a day became a list of piazzas you happened to pass. Day 2 of
// Rome came out as twenty stops; segmented by time it is seven, and those
// seven match what David wrote himself — a run, a gap where he moved
// hotels, a long afternoon, an evening in three parts.
//
// The rule that fixes it: a day is made of the times you STOPPED, and the
// gaps between them are the walking. A gap in the photographs is the
// strongest signal there is, because people stop taking pictures when they
// are getting somewhere and start again when they arrive.
//
// Distance still matters, but as a coarse check rather than the primary
// one — six hundred metres, not a hundred and fifty. Shooting continuously
// from a moving car is a real thing; drifting round a piazza is not a
// journey.

import { metresApart } from './photoDays.js'

/** Longer than this without a photograph and you went somewhere else. */
export const GAP_MINUTES = 25

/** Far enough that you cannot have walked it between two shots. */
export const FAR_METRES = 600

/** Below this you passed through; at or above it you were there. Only
 *  places you stayed are worth naming, and naming only those is what stops
 *  a day reading as a list of everything within a block of your route. */
export const STAYED_MINUTES = 20

const mins = (a, b) => Math.abs(new Date(b) - new Date(a)) / 60000

/**
 * A day's photographs as the times you stopped.
 *
 * @returns segments, each { photos, from, to, minutes, lat, lon, stayed }
 */
export function segment(photos = [], { gap = GAP_MINUTES, far = FAR_METRES } = {}) {
  const order = [...photos]
    .filter((p) => p?.taken_at)
    .sort((a, b) => String(a.taken_at).localeCompare(String(b.taken_at)))

  const out = []
  for (const photo of order) {
    const open = out[out.length - 1]
    const last = open?.photos[open.photos.length - 1]

    const broken =
      !open ||
      mins(last.taken_at, photo.taken_at) > gap ||
      (photo.lat != null && metresApart(middle(open), photo) > far)

    if (broken) out.push({ photos: [photo] })
    else open.photos.push(photo)
  }

  return out.map((s) => {
    const c = middle(s)
    const from = s.photos[0].taken_at
    const to = s.photos[s.photos.length - 1].taken_at
    const minutes = Math.round(mins(from, to))
    return { photos: s.photos, from, to, minutes, lat: c.lat, lon: c.lon, stayed: minutes >= STAYED_MINUTES }
  })
}

function middle(seg) {
  const located = seg.photos.filter((p) => p.lat != null && p.lon != null)
  if (!located.length) return { lat: null, lon: null }
  return {
    lat: located.reduce((s, p) => s + p.lat, 0) / located.length,
    lon: located.reduce((s, p) => s + p.lon, 0) / located.length,
  }
}

/**
 * The things the app already knows happened on a day.
 *
 * This is the part the photograph-only version missed entirely. David ran
 * 21.4 km through Rome on the morning of 23 January — it is in the runs
 * table, with the route, the pace and the climb — and the reconstruction
 * said "The evening at La Cenatio Rotunda". The best fact about the day
 * was already in the database and nothing looked.
 */
export function knownOn(date, { runs = [], flights = [], weather = [] } = {}) {
  return {
    runs: runs.filter((r) => r?.run_date === date),
    flights: flights.filter((f) => String(f?.dep_time ?? '').slice(0, 10) === date),
    // The whole trip's weather, not just this day's, because whether a day
    // is worth mentioning is a question about the trip it sits in — eighteen
    // degrees is a cold day in Bangkok and a good one in Reykjavik. tellDay
    // picks its own day out of it by date. See weatherStory.js.
    weather,
  }
}

/** Only the segments worth paying a lookup for. Everything else is walking,
 *  and naming the walking is what produced the piazza soup. */
export function worthNaming(segments = []) {
  return segments.filter((s) => s.stayed && s.lat != null)
}
