// The plan, as sentences, before anything is uploaded.
//
// photoRouting decides which trip a run of photos belongs to. This turns
// that decision into the rows a person reads and can argue with — including
// the two things routing has nothing to say about: photos with no date in
// them at all, and what happens when somebody overrides a row by hand.
//
// Separate from the component because the interesting part is the
// arithmetic, and because "what would this upload do" is a question worth
// being able to ask without a phone, a camera and a holiday.

import { candidates, describeRoute, routeClusters } from './photoRouting.js'

/**
 * Photos routed through WhatsApp, Slack or Google Photos routinely arrive
 * with EXIF stripped, so this is an ordinary case rather than an error. They
 * cannot be routed — nothing about them says when — so they go wherever the
 * person was already pointing, and the row says so out loud rather than
 * quietly adding them to something.
 */
export const UNDATED = 'undated'

/**
 * @param clusters  from clusterPhotos()
 * @param undated   the photos it could not date
 * @param trips     everything to choose between
 * @param fallback  the trip currently selected, for the undated ones
 * @returns rows    one per run of photos, plus at most one undated row
 */
export function planUpload({ clusters = [], undated = [], trips = [], fallback = null } = {}) {
  const rows = routeClusters(clusters, trips).map((route, i) => ({
    key: `run-${i}`,
    kind: 'run',
    route,
    photos: route.cluster.photos ?? [],
    // What the row will actually do, which is the routed answer until
    // somebody changes it. 'new' stays null: the trip does not exist yet.
    tripId: route.decision === 'one' ? route.trip.id : null,
    // A question the person has to answer rather than a default that
    // answers it for them.
    unresolved: route.decision === 'choose',
  }))

  if (undated.length) {
    rows.push({
      key: UNDATED,
      kind: UNDATED,
      route: null,
      photos: undated,
      tripId: fallback?.id ?? null,
      unresolved: !fallback,
    })
  }
  return rows
}

/** The sentence for one row. */
export function describeRow(row, trips = []) {
  if (!row) return ''
  const n = row.photos?.length ?? 0
  const photos = `${n} photo${n === 1 ? '' : 's'}`
  if (row.kind === UNDATED) {
    const to = trips.find((t) => t.id === row.tripId)
    return `${photos} with no date in them → ${to ? to.title : 'nowhere yet — pick a trip'}`
  }
  // Once somebody has picked, the row says what it will do rather than what
  // it originally thought.
  const chosen = trips.find((t) => t.id === row.tripId)
  if (chosen && row.route?.decision !== 'one') return `${photos} → ${chosen.title}`
  return describeRoute(row.route)
}

/** Nothing may upload while a row is still a question. */
export function readyToUpload(rows = []) {
  return rows.length > 0 && rows.every((r) => !r.unresolved)
}

/**
 * How many trips this will create, said before it happens. "Three new
 * trips" is a thing to know in advance; discovering it afterwards on the
 * globe is not.
 *
 * A row with no trip is not necessarily a new one — an unanswered question
 * has no trip either, and counting it promised a trip that would never be
 * made. Only a settled row with nowhere to go creates anything.
 */
export function newTripCount(rows = []) {
  return rows.filter((r) => r.kind === 'run' && !r.tripId && !r.unresolved).length
}

/**
 * The trips to offer for one row, in the order they are worth offering.
 *
 * The picker listed every trip in whatever order they arrived — nineteen of
 * them, including the empty ones left behind by abandoned uploads — so
 * choosing where two hundred photographs should go meant reading a list of
 * names with no relation to the dates in front of you. David, 12 August:
 * "why am i seeing the full list?"
 *
 * Nothing is hidden. The trips whose days these photographs actually fall in
 * come first, best fit at the top, and everything else follows by how recent
 * it is — because if the dates do not help, the thing you were looking at
 * lately probably does. Examples go last: they belong to somebody else, and
 * picking one publishes your photographs into their trip.
 */
export function pickerFor(row, trips = []) {
  const all = (trips ?? []).filter(Boolean)
  const cluster = row?.route?.cluster ?? null
  const fits = cluster ? candidates(cluster, all).map((c) => c.trip) : []
  const taken = new Set(fits.map((t) => t.id))

  const rest = all
    .filter((t) => !taken.has(t.id))
    .sort((a, b) => {
      if (!!a.is_demo !== !!b.is_demo) return a.is_demo ? 1 : -1
      return String(b.start_date ?? '').localeCompare(String(a.start_date ?? ''))
    })

  return { fits, rest }
}
