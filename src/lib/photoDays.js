// What three hundred photographs already say about a trip.
//
// Every one of them carries the moment it was taken and, usually, where —
// 283 of Rome's 299 have coordinates. That is a day-by-day account of where
// somebody went and how long they stayed, sitting in the table already,
// written down by the camera rather than remembered afterwards.
//
// This turns that into days and stops. It is arithmetic, not inference:
// nothing here guesses at what happened, decides what was interesting, or
// describes a photograph it has not looked at. The output is "you were
// within a hundred metres of this point from 10:14 to 12:40 and took
// eleven pictures", which is a fact, and every sentence built from it says
// so — David's own stance, from the New Orleans reconstruction: it is built
// from data rather than from a log, and it should never pretend otherwise.

/** Far enough apart to be somewhere else rather than the same place from a
 *  different angle. A hundred and fifty metres is about a city block. */
export const STOP_METRES = 150

/** Long enough to be a stop rather than passing through. */
export const STOP_MINUTES = 12

const R = 6371000

/** Metres between two points on the ground. */
export function metresApart(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const dφ = φ2 - φ1
  const dλ = ((b.lon - a.lon) * Math.PI) / 180
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const minutes = (a, b) => Math.abs(new Date(b) - new Date(a)) / 60000

/**
 * A day's photographs, in the order they were taken, grouped into places.
 *
 * A new stop begins when a photograph is taken more than STOP_METRES from
 * where the current one is centred. Photographs with no coordinates join
 * whatever stop is open — they were taken between two located ones, so
 * that is where they were, even though they cannot say so themselves.
 */
export function stopsIn(photos = []) {
  const order = [...photos]
    .filter((p) => p?.taken_at)
    .sort((a, b) => String(a.taken_at).localeCompare(String(b.taken_at)))

  const stops = []
  for (const photo of order) {
    const open = stops[stops.length - 1]
    if (!open || (photo.lat != null && metresApart(centre(open), photo) > STOP_METRES)) {
      stops.push({ photos: [photo] })
      continue
    }
    open.photos.push(photo)
  }

  return stops.map((s) => {
    const c = centre(s)
    const first = s.photos[0].taken_at
    const last = s.photos[s.photos.length - 1].taken_at
    return {
      photos: s.photos,
      lat: c.lat,
      lon: c.lon,
      from: first,
      to: last,
      minutes: Math.round(minutes(first, last)),
      // Somewhere you stood for a while, as against somewhere you walked
      // past and photographed. Only ever used to rank, never to discard.
      lingered: minutes(first, last) >= STOP_MINUTES,
    }
  })
}

function centre(stop) {
  const located = stop.photos.filter((p) => p.lat != null && p.lon != null)
  if (!located.length) return { lat: null, lon: null }
  return {
    lat: located.reduce((s, p) => s + p.lat, 0) / located.length,
    lon: located.reduce((s, p) => s + p.lon, 0) / located.length,
  }
}

/**
 * A trip's photographs as days.
 *
 * Keyed on taken_on, which the uploader already worked out from EXIF in
 * the phone's own timezone — safer than re-deriving it here from a UTC
 * instant, which is how a photograph taken at 1am in Tokyo ends up filed
 * under the previous day.
 */
export function daysFrom(photos = [], trip = {}) {
  const byDay = new Map()
  for (const p of photos) {
    if (!p?.taken_on) continue
    if (!byDay.has(p.taken_on)) byDay.set(p.taken_on, [])
    byDay.get(p.taken_on).push(p)
  }

  const dates = [...byDay.keys()].sort()
  const start = trip.start_date || dates[0]

  return dates.map((date) => {
    const shots = byDay.get(date)
    const stops = stopsIn(shots)
    const located = shots.filter((p) => p.lat != null)
    return {
      date,
      day_number: start ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1 : null,
      photos: shots,
      stops,
      // The day's own centre, for the map pin on the entry.
      lat: located.length ? located.reduce((s, p) => s + p.lat, 0) / located.length : null,
      lon: located.length ? located.reduce((s, p) => s + p.lon, 0) / located.length : null,
      from: stops[0]?.from ?? null,
      to: stops[stops.length - 1]?.to ?? null,
    }
  })
}

const hhmm = (t) =>
  new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * The day, in a sentence, said only in terms of what the camera recorded.
 *
 * No adjectives about the day and nothing about what is in the pictures.
 * "A long stop near the middle of the afternoon" is a fact about
 * timestamps; "a lazy afternoon" is a claim about somebody's holiday that
 * nothing here is entitled to make.
 */
export function describeDay(day, { named = {} } = {}) {
  if (!day?.photos?.length) return ''
  const places = day.stops.filter((s) => s.lingered)
  const where = (s) => named[`${s.lat?.toFixed(4)},${s.lon?.toFixed(4)}`] || null

  const parts = []
  parts.push(
    `${count(day.photos.length, 'photograph', 'photographs')} between ${hhmm(day.from)} and ${hhmm(day.to)}.`
  )

  if (places.length) {
    const named_ = places.map(where).filter(Boolean)
    parts.push(
      named_.length === places.length
        ? `Time spent at ${named_.join(', ')}.`
        : `${count(places.length, 'place', 'places')} stopped at for more than ${STOP_MINUTES} minutes.`
    )
    const longest = [...places].sort((a, b) => b.minutes - a.minutes)[0]
    const name = where(longest)
    parts.push(
      `The longest was ${Math.round(longest.minutes / 60) >= 1 ? `${(longest.minutes / 60).toFixed(1)} hours` : `${longest.minutes} minutes`}${name ? ` at ${name}` : ''}, from ${hhmm(longest.from)}.`
    )
  } else if (day.stops.length > 1) {
    parts.push(`${count(day.stops.length, 'place', 'places')}, none of them for long.`)
  }

  const missing = day.photos.length - day.photos.filter((p) => p.lat != null).length
  if (missing) parts.push(`${count(missing, 'photograph carries', 'photographs carry')} no location.`)

  return parts.join(' ')
}

/** The line that must appear on anything written this way. */
export const RECONSTRUCTED =
  'Reconstructed from the dates and locations in the photographs, not written at the time.'

/** A day → the journal entry it would become. Never saved by this module. */
export function draftEntry(day, trip = {}, options = {}) {
  return {
    trip_id: trip.id ?? null,
    entry_date: day.date,
    day_number: day.day_number,
    title: `Day ${day.day_number ?? ''}`.trim(),
    note: `${describeDay(day, options)}\n\n${RECONSTRUCTED}`,
    lat: day.lat,
    lon: day.lon,
    city: null,
    mood: null,
    tags: ['reconstructed'],
  }
}
