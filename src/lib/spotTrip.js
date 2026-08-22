// Noticing that somebody has been on a trip, without being told.
//
// David's friends land in Canada having never opened this app. They will
// upload photos from the first few days and there is no itinerary, no
// booking, no flight — nothing to say "this is a trip" except the
// photographs themselves. Until now the app never volunteered: clusterPhotos
// only ran once somebody had already chosen "make a trip", so the person who
// most needed the offer was the one who had to know to ask for it.
//
// ── The rule, and why it is this one ──────────────────────────────────────
//
// Two or more consecutive days of photographs, taken far enough from home
// that they cannot be your own city. That is all.
//
// Not "abroad", deliberately. Three days of photographs seven hundred
// kilometres from home is a trip whether or not a border was crossed —
// Melbourne to Sydney counts, and an app called Pond Hopping that only
// noticed international travel would be wrong about most of what people do.
//
// ── What it refuses to do ─────────────────────────────────────────────────
//
// It will not offer when it does not know where home is. A wrong offer is
// expensive in a way a missing one is not: getting it wrong once — a weekend
// in Toronto that was not a trip — teaches somebody that the app guesses
// badly, and they stop reading what it says. Silence costs one tap on "add a
// trip". So every uncertainty resolves to saying nothing.
//
// ── What it can still get wrong ───────────────────────────────────────────
//
// Home is a country, sharpened to a city by the timezone — see homeIs.js.
// Great Britain has one timezone, so everybody who says "the UK" is measured
// from London. Somebody who lives in Glasgow and photographs two days of
// Glasgow is five hundred and fifty kilometres from "home" by that reckoning
// and will be asked whether it was a trip. It wasn't.
//
// Left as it is, knowingly. The wrong question here costs one tap on "No,
// keep them loose" and the photographs are kept either way — nothing is
// deleted, published or moved by getting this wrong. The real fix is to
// learn home from where somebody's own photographs actually cluster, which
// needs a history this is specifically for the people who have none of.

/** How far from home stops being your own city. */
export const AWAY_KM = 250

/** A day out is not a trip. Two days of photographs somewhere else is. */
export const MIN_DAYS = 2

const R = 6371
const rad = (d) => (d * Math.PI) / 180

/** Great-circle kilometres between two points. */
export function apart(a, b) {
  if (!Number.isFinite(a?.lat) || !Number.isFinite(a?.lon)) return null
  if (!Number.isFinite(b?.lat) || !Number.isFinite(b?.lon)) return null
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))))
}

/** How many calendar days a cluster covers. A single day is one, not zero. */
export function spanDays(cluster) {
  if (!cluster?.start || !cluster?.end) return 0
  const a = Date.parse(`${cluster.start}T00:00:00Z`)
  const b = Date.parse(`${cluster.end}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / 86400000) + 1
}

/**
 * The cluster worth offering as a trip, or null.
 *
 * @param clusters  from clusterPhotos()
 * @param home      from homeIs() — { lat, lng, known }
 * @param already   trips that already exist, so we never offer one twice
 *
 * Returns the *most recent* qualifying cluster rather than the largest. The
 * offer is about what somebody is doing now — a fortnight in Peru two years
 * ago is a fine thing to import and a strange thing to be asked about on the
 * way out of an airport.
 */
export function spotTrip({ clusters = [], home, already = [], minDays = MIN_DAYS, awayKm = AWAY_KM } = {}) {
  // Not knowing where home is, everything is equally far from it. Saying
  // nothing is the only honest option, and it is one tap to add a trip.
  if (!home?.known || !Number.isFinite(home.lat) || !Number.isFinite(home.lng)) return null

  const from = { lat: home.lat, lon: home.lng }
  const taken = new Set(
    (already ?? [])
      .filter((t) => t?.start_date)
      .map((t) => String(t.start_date).slice(0, 10))
  )

  const worth = clusters
    .map((c) => ({ cluster: c, days: spanDays(c), km: apart(from, c?.centre) }))
    .filter(({ cluster, days, km }) => {
      if (days < minDays) return false
      if (km == null) return false // nothing located: no idea where, so no offer
      if (km < awayKm) return false
      // A trip already starting on that day is this trip, imported already.
      return !taken.has(cluster.start)
    })

  if (!worth.length) return null
  // Most recent by its last photograph.
  worth.sort((a, b) => (a.cluster.end < b.cluster.end ? 1 : a.cluster.end > b.cluster.end ? -1 : 0))
  const best = worth[0]
  return { ...best.cluster, days: best.days, km: best.km }
}

// ── Saying it ─────────────────────────────────────────────────────────────
//
// Here rather than in the sheet because they are statements about a spotted
// run, and because a sentence shown to somebody the first time they use the
// app is worth a test.

const WORDS = ['', 'One day', 'Two days', 'Three days', 'Four days', 'Five days',
               'Six days', 'Seven days', 'Eight days', 'Nine days', 'Ten days']

/** "Five days", from a spotted run. Never "1 days". */
export function spotDays(spot) {
  const n = spot?.days ?? 0
  return WORDS[n] || `${n} days`
}

/**
 * How far away, said the way a person would.
 *
 * Rounded hard on purpose. "6,873 km" is a measurement; the number came out
 * of the middle of a cloud of photographs and the last two digits of it are
 * fiction. Rounding to a hundred says the same true thing without claiming a
 * precision nobody has.
 */
export function farAway(km) {
  if (!Number.isFinite(km) || km < 0) return 'a long way'
  if (km < 1000) return `${Math.max(10, Math.round(km / 10) * 10)} km`
  return `${(Math.round(km / 100) * 100).toLocaleString('en-GB')} km`
}
