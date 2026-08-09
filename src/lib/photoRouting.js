// Which trip these photos belong to.
//
// The app already reads dates off a photo before it leaves the phone, and
// already knows how to build a trip around a run of them — that is what
// "Start from photos" does. What it never did was use any of that when you
// add photos to a log you already have: the uploader aimed at whichever trip
// happened to be selected on Home, silently, and with no way to move a photo
// afterwards. Two hundred pictures on the wrong trip was unrecoverable.
//
// So: cluster the dates (tripFromPhotos already does), then ask which
// existing trip each run of days falls inside. Usually exactly one, and then
// there is nothing to ask. Sometimes none, and the answer is a new trip with
// its dates already filled in. Occasionally two, and the honest thing is a
// question — overlapping trips are rare and guessing between them is worse
// than asking.
//
// Pure, so the decision can be tested without a phone full of photographs.

const DAY = 86400000
const parse = (iso) => (iso ? Date.parse(`${iso}T00:00:00Z`) : NaN)

/**
 * A day either side, because the day you fly is claimed by both ends of a
 * trip and photos taken in the departure lounge belong to the trip you are
 * leaving on, not the fortnight before it.
 */
export const EDGE_DAYS = 1

/**
 * How much of a trip's span an open-ended one is assumed to cover. Same
 * number the recorder uses: long enough for a genuinely long trip, short
 * enough that a trip left open in 2019 stops swallowing everything.
 */
export const OPEN_ENDED_DAYS = 120

function span(trip) {
  const from = parse(trip?.start_date)
  if (!Number.isFinite(from)) return null
  const to = Number.isFinite(parse(trip?.end_date))
    ? parse(trip.end_date)
    : from + OPEN_ENDED_DAYS * DAY
  return { from: from - EDGE_DAYS * DAY, to: to + EDGE_DAYS * DAY }
}

/** Days the trip and the photos have in common, and the two spans. */
function shared(cluster, trip) {
  const s = span(trip)
  const from = parse(cluster?.start)
  const to = parse(cluster?.end)
  if (!s || !Number.isFinite(from) || !Number.isFinite(to)) return null
  const lo = Math.max(s.from, from)
  const hi = Math.min(s.to, to)
  if (hi < lo) return null
  // Measured inclusive, because a one-day cluster has zero length and is
  // still a day.
  return {
    covered: (hi - lo) / DAY + 1,
    clusterDays: (to - from) / DAY + 1,
    tripDays: (s.to - s.from) / DAY + 1,
  }
}

/** How many of the cluster's days this trip actually covers, 0–1. */
export function overlap(cluster, trip) {
  const s = shared(cluster, trip)
  return s ? Math.min(1, s.covered / s.clusterDays) : 0
}

/**
 * How much of the trip these photos account for, 0–1.
 *
 * The tie-breaker, and it has to be a separate number. A Tuesday in Rome
 * sits fully inside both a week in Rome and a trip somebody left open four
 * months ago — identical on coverage, and obviously not equally good
 * answers. This is what tells them apart.
 */
export function specificity(cluster, trip) {
  const s = shared(cluster, trip)
  return s ? Math.min(1, s.covered / s.tripDays) : 0
}

/**
 * The trips that could claim this cluster, best first: how completely the
 * trip explains the photos, then how completely the photos explain the trip.
 *
 * Examples are never candidates. An example is a copy of a real trip, which
 * means it carries the same dates as the real trip and matches it exactly —
 * so every upload becomes "China & Japan, or China & Japan?", a coin toss
 * with the two sides labelled the same. Getting that wrong does not put two
 * hundred pictures on the wrong trip; it puts somebody's own photographs on
 * the trip that is published to everybody. Curating an example is a
 * deliberate act and stays one: pick it by hand, never by date.
 */
export function candidates(cluster, trips = []) {
  return (trips ?? [])
    .filter((trip) => !trip?.is_demo)
    .map((trip) => ({ trip, score: overlap(cluster, trip), fit: specificity(cluster, trip) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || b.fit - a.fit)
}

/** Comfortably ahead of the next one, rather than merely first. */
export const CLEAR_WIN = 0.25

/**
 * How much tighter a fit has to be to settle a tie on its own. Twice: a week
 * in Rome against four months left open is seventeen times tighter and not a
 * close call; a week against a fortnight is one and a half, and is.
 */
export const MUCH_TIGHTER = 2

/**
 * What to do with each run of photos.
 *
 *   one    — exactly one trip, or one obviously better than the rest. Say
 *            which; do not ask.
 *   choose — two that both fit. Ask, with both named.
 *   new    — nothing covers these days. Offer a trip, dates already filled.
 */
export function routeClusters(clusters = [], trips = []) {
  return (clusters ?? []).map((cluster) => {
    const found = candidates(cluster, trips)
    if (!found.length) return { cluster, matches: [], decision: 'new', trip: null }
    // Clear on coverage, or — when coverage ties, which it does whenever a
    // short trip sits inside a long one — clear because one of them is
    // overwhelmingly more about these days than the other.
    const clear =
      found.length === 1 ||
      found[0].score - found[1].score >= CLEAR_WIN ||
      found[0].fit >= found[1].fit * MUCH_TIGHTER
    return {
      cluster,
      matches: found.map((f) => f.trip),
      decision: clear ? 'one' : 'choose',
      trip: clear ? found[0].trip : null,
    }
  })
}

/**
 * The sentence shown before anything is uploaded, because after is too late.
 * "40 of these look like Rome, 12–19 Jan. 6 are from March and match
 * nothing."
 */
export function describeRoute({ cluster, decision, trip, matches } = {}) {
  const n = cluster?.count ?? 0
  const photos = `${n} photo${n === 1 ? '' : 's'}`
  if (decision === 'one') return `${photos} → ${trip.title}`
  if (decision === 'choose') return `${photos} → ${matches.map((t) => t.title).join(' or ')}?`
  return `${photos} → a new trip, ${cluster?.start}${cluster?.end !== cluster?.start ? ` to ${cluster.end}` : ''}`
}
