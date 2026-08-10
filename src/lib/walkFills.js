// A walk knows where you went; photographs only know where you stopped.
//
// The reconstruction spends its effort inferring movement from scattered
// pictures — a gap of two hours between the Forum and dinner is a hole it
// can only describe as a hole. But if there is a walk on that day, its GPS
// track goes straight through the hole, and the answer is not inferred at
// all. It is recorded.
//
// This is why walking matters more here than cycling or swimming. It is
// not another row in a fitness panel; it is the day's movement, already
// written down, by a device most people carry without deciding to.
//
// The track is used to say where a gap went, never to invent a stop. A
// walk passing a building is not a visit to it — the same rule that stopped
// the piazza soup.

import { metresApart } from './photoDays.js'
import { isOnFoot } from './sport.js'

/** Far enough off the line to be somewhere rather than en route. */
export const NEAR_TRACK_M = 120

/** A gap worth explaining at all. Below this nobody wonders. */
export const GAP_WORTH_EXPLAINING = 45

const mins = (a, b) => Math.abs(new Date(b) - new Date(a)) / 60000

/** The gaps in a day: between one stop ending and the next beginning. */
export function gapsIn(segments = []) {
  const out = []
  for (let i = 0; i < segments.length - 1; i++) {
    const from = segments[i]?.to
    const to = segments[i + 1]?.from
    if (!from || !to) continue
    const minutes = Math.round(mins(from, to))
    if (minutes >= GAP_WORTH_EXPLAINING) out.push({ after: i, from, to, minutes })
  }
  return out
}

/**
 * How much of a gap a walk accounts for.
 *
 * A track that runs through the whole gap explains it. One that covers a
 * few minutes of it does not, and saying "you walked a bit" about two
 * missing hours is the kind of half-answer that reads as padding.
 */
export function coveredBy(gap, activity) {
  if (!gap || !isOnFoot(activity)) return 0
  const started = activity.started_at || activity.start_time
  if (!started) return 0
  const ends = new Date(new Date(started).getTime() + (Number(activity.duration_min) || 0) * 60000)
  const overlapFrom = new Date(Math.max(new Date(gap.from), new Date(started)))
  const overlapTo = new Date(Math.min(new Date(gap.to), ends))
  return Math.max(0, Math.round((overlapTo - overlapFrom) / 60000))
}

/** Points on the track that are nowhere near a stop — the parts of the
 *  route the photographs say nothing about. */
export function unseenPart(coords = [], stops = []) {
  return coords.filter((c) => {
    const at = { lat: c?.[0], lon: c?.[1] }
    if (at.lat == null) return false
    return !stops.some((s) => metresApart(s, at) <= NEAR_TRACK_M)
  })
}

/**
 * What a day's on-foot tracks add to its story.
 *
 * @returns { km, explained } — distance covered on foot, and the gaps a
 *   track runs through, longest first
 */
export function onFootIn(day = {}, activities = []) {
  const feet = activities.filter(isOnFoot)
  if (!feet.length) return { km: 0, explained: [] }

  const km = feet.reduce((n, a) => n + (Number(a.distance_km) || 0), 0)
  const gaps = gapsIn(day.segments ?? [])

  const explained = gaps
    .map((g) => ({ ...g, covered: Math.max(...feet.map((a) => coveredBy(g, a)), 0) }))
    // Most of the gap, or it explains nothing worth saying.
    .filter((g) => g.covered >= g.minutes * 0.6)
    .sort((a, b) => b.minutes - a.minutes)

  return { km: Math.round(km * 10) / 10, explained }
}
