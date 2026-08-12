// A pile of photos, read as a trip.
//
// This is the answer to "I've already been somewhere" — the one thing the app
// could not do. Every other way in (forward a booking, scan Gmail, ask an
// assistant) describes a trip you *booked*. Photos are what you actually have
// afterwards, and they carry the two facts that define a trip: when, and
// roughly where.
//
// Nothing here touches the network or the DOM. It takes what exif.js already
// pulls out of each file and decides what the trip is, so the decision can be
// tested without a browser, a camera or a holiday.

/**
 * A gap this long means a different trip.
 *
 * Four days is chosen to sit clearly between the two things it must separate:
 * an unphotographed stretch inside one trip (a travel day, a conference, two
 * days of rain) and the space between two trips. Shorter and a quiet Tuesday
 * splits a fortnight in half; much longer and a weekend away in the same
 * month gets swallowed by the trip before it.
 */
export const GAP_DAYS = 4

const DAY = 86400000
const toTime = (p) => (p?.takenAt ? Date.parse(p.takenAt) : NaN)
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10)

/**
 * Split photos into runs of consecutive days.
 *
 * Photos with no usable date are not guesses waiting to happen — they are
 * carried separately so the caller can say "and 12 we couldn't date" rather
 * than silently dropping them or inventing a day for them.
 *
 * @param {Array<{takenAt?: string, lat?: number, lon?: number}>} photos
 * @returns {{ clusters: Array<object>, undated: Array<object> }}
 */
export function clusterPhotos(photos, { gapDays = GAP_DAYS } = {}) {
  const dated = []
  const undated = []
  for (const p of photos ?? []) {
    const t = toTime(p)
    if (Number.isFinite(t)) dated.push({ ...p, _t: t })
    else undated.push(p)
  }
  dated.sort((a, b) => a._t - b._t)

  const clusters = []
  let current = null
  for (const p of dated) {
    if (current && p._t - current.last <= gapDays * DAY) {
      current.photos.push(p)
      current.last = p._t
    } else {
      current = { photos: [p], first: p._t, last: p._t }
      clusters.push(current)
    }
  }
  return { clusters: clusters.map(describe), undated }
}

/** Everything the confirm screen needs to show, and the insert needs to write. */
function describe(c) {
  const located = c.photos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  const bounds = located.length
    ? {
        minLat: Math.min(...located.map((p) => p.lat)),
        maxLat: Math.max(...located.map((p) => p.lat)),
        minLon: Math.min(...located.map((p) => p.lon)),
        maxLon: Math.max(...located.map((p) => p.lon)),
      }
    : null
  return {
    photos: c.photos,
    count: c.photos.length,
    start: dayOf(c.first),
    end: dayOf(c.last),
    nights: Math.max(0, Math.round((c.last - c.first) / DAY)),
    located: located.length,
    bounds,
    centre: bounds
      ? { lat: (bounds.minLat + bounds.maxLat) / 2, lon: (bounds.minLon + bounds.maxLon) / 2 }
      : null,
  }
}

/**
 * Is this cluster still going?
 *
 * A trip you're on and a trip you took are the same import — the only
 * difference is whether the last photo is recent enough that an end date
 * would be a guess. Under two days, leave it open.
 */
export function looksOngoing(cluster, now = Date.now()) {
  if (!cluster?.end) return false
  return now - Date.parse(`${cluster.end}T23:59:59Z`) < 2 * DAY
}

/**
 * A first stab at a name, used as the pre-filled value on the confirm screen —
 * never written without being shown.
 *
 * Deliberately not reverse-geocoded: that is a network call, a key and a
 * rate limit for a string the user is about to read and correct anyway. A
 * month and a year is honest, recognisable, and obviously editable.
 */
export function suggestTitle(cluster) {
  if (!cluster?.start) return 'A trip'
  const d = new Date(`${cluster.start}T00:00:00Z`)
  const month = d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })
  return `${month} ${d.getUTCFullYear()}`
}

/** URL-safe, collision-resistant enough, and readable in a share link. */
/**
 * @param title  what the trip is called
 * @param when   its start date, so two "April 2026"s a year apart differ
 * @param unique something to break a tie with, passed only when a slug has
 *               actually collided
 *
 * The first two are deterministic on purpose: the same photographs picked
 * twice should describe the same trip, and a slug that changed on every
 * attempt would make a retry look like a different journey.
 *
 * Which is also how somebody hit `duplicate key value violates unique
 * constraint "trips_slug_key"`: an upload that was closed part-way had
 * already created the trip, and starting again produced the identical slug.
 * The answer is not to make every slug random — it is to add a tail only
 * when the shelf is genuinely occupied. See StartFromPhotos, which retries
 * once with one.
 */
export function slugify(title, when = '', unique = null) {
  const base = String(title || 'trip')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  const stamp = String(when).replace(/-/g, '').slice(2, 8)
  const tail = unique == null ? '' : Number(unique).toString(36)
  return [base || 'trip', stamp, tail].filter(Boolean).join('-')
}

/**
 * The one-line summary shown before anything is created.
 *
 * It has to be able to say "we don't know", because photos routed through
 * WhatsApp, Slack or Google Photos routinely arrive with EXIF stripped — and
 * a flow that treats that as an error would fail on a very ordinary way of
 * getting photos onto a phone.
 */
export function summarise(cluster, undatedCount = 0) {
  if (!cluster) {
    return undatedCount
      ? `${undatedCount} photo${undatedCount === 1 ? '' : 's'}, none with a date in them — you'll need to say when.`
      : 'No photos yet.'
  }
  const when =
    cluster.start === cluster.end
      ? fmt(cluster.start)
      : `${fmt(cluster.start)} – ${fmt(cluster.end)}`
  const where = cluster.located
    ? `${cluster.located} with a location`
    : 'none with a location'
  return `${cluster.count} photo${cluster.count === 1 ? '' : 's'} · ${when} · ${where}`
}

function fmt(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
