// A Google Timeline export, read as a list of trips.
//
// Photos answer "I've already been somewhere" one trip at a time. A timeline
// export answers it for every trip you have ever taken, in one file, on any
// phone — it is a file you upload, so unlike recording places it needs no
// permission, works on Android and the web, and is entirely retrospective.
//
// The hard part is not parsing. It is that the file contains every ordinary
// day of your life as well: the school run, the office, the supermarket. A
// naive gap-based clustering of a continuous timeline produces exactly one
// cluster, several years long. So the question this module actually answers
// is "which days were you *away*", which means finding home first and reading
// trips as the runs of days spent far from it.
//
// Nothing here touches the network or the DOM.

import { distanceKm } from './geo.js'
import { AIRPORT_COORDS } from './airportCoords.js'
import { AIRPORT_CITY } from './airportCities.js'

/**
 * Farther than this from home and the day was not an ordinary one.
 *
 * 120km clears a commute, a day in the next city and a weekend at the
 * in-laws' without clearing an actual trip: the nearest genuinely different
 * place is further away than the furthest ordinary errand, in every country
 * with a car in it.
 */
export const AWAY_KM = 120

/** Roughly the radius of a life — the grid cell home is found in. */
export const HOME_CELL_KM = 25

/**
 * A day with no signal at all does not end a trip. Phones die, get put in
 * flight mode, and spend whole days in a bag. One such day inside a run of
 * away days is part of the trip; two is a decision the file cannot support.
 */
export const MERGE_GAP_DAYS = 1

/** A day out is not a trip. Kept, counted, but not offered by default. */
export const MIN_NIGHTS = 1

/** Below this a stop is somewhere you passed through, not somewhere you were. */
export const MIN_STOP_MINUTES = 10

const DAY = 86400000
const E7 = 1e7

// ---------------------------------------------------------------- parsing

/**
 * Google has shipped four shapes of this file and kept none of them.
 *
 * - `semanticSegments`: the current on-device export (Android), and the same
 *   thing as a bare top-level array on iOS.
 * - `timelineObjects`: Takeout's Semantic Location History, one file a month.
 * - `locations`: Takeout's Records.json — raw fixes, no notion of a visit,
 *   and frequently a gigabyte.
 *
 * Detection is by shape rather than by filename because people rename
 * downloads, and because the iOS export arrives called `Timeline.json`
 * whatever is inside it.
 */
export function detectFormat(data) {
  if (Array.isArray(data)) {
    const first = data.find(Boolean)
    if (!first) return 'empty'
    if (first.visit || first.activity || first.timelinePath || first.startTime) return 'segments'
    if (first.latitudeE7 !== undefined || first.timestamp) return 'records'
    return 'unknown'
  }
  if (!data || typeof data !== 'object') return 'unknown'
  if (Array.isArray(data.semanticSegments)) return 'segments'
  if (Array.isArray(data.timelineObjects)) return 'timelineObjects'
  if (Array.isArray(data.locations)) return 'records'
  return 'unknown'
}

/**
 * "37.421998°, -122.084000°", "geo:37.421998,-122.084000", or an E7 pair.
 * Returns null rather than a plausible-looking zero for anything else — an
 * unparsed coordinate that silently becomes [0, 0] puts your holiday in the
 * Atlantic.
 */
export function parseLatLng(value) {
  if (value == null) return null
  if (typeof value === 'object') {
    if (Number.isFinite(value.latitudeE7) && Number.isFinite(value.longitudeE7)) {
      return { lat: value.latitudeE7 / E7, lon: value.longitudeE7 / E7 }
    }
    if (Number.isFinite(value.latE7) && Number.isFinite(value.lngE7)) {
      return { lat: value.latE7 / E7, lon: value.lngE7 / E7 }
    }
    if (Number.isFinite(value.lat) && Number.isFinite(value.lng)) {
      return { lat: value.lat, lon: value.lng }
    }
    return parseLatLng(value.latLng ?? value.point ?? null)
  }
  if (typeof value !== 'string') return null
  const m = value.replace(/^geo:/, '').match(/(-?\d+(?:\.\d+)?)\s*°?\s*,\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

/**
 * The calendar day the person was living in, not the one UTC was.
 *
 * The export stamps every time with the offset it happened in, which is the
 * only reason a 9pm dinner in Tokyo can be filed under the right day. Throw
 * that offset away and a fortnight in Asia gains a day at each end.
 */
export function localDay(iso) {
  if (typeof iso !== 'string') return null
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/)
  if (!m) {
    const t = Date.parse(iso)
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null
  }
  // Already local when there is no offset, and when the offset is the one
  // the timestamp is written in the timezone of.
  return m[1]
}

/** "14:05" in the offset the stop was recorded in. */
export function localTime(iso) {
  const m = typeof iso === 'string' && iso.match(/T(\d{2}:\d{2})/)
  return m ? m[1] : null
}

const minutesBetween = (a, b) => {
  const t1 = Date.parse(a)
  const t2 = Date.parse(b)
  return Number.isFinite(t1) && Number.isFinite(t2) ? Math.round((t2 - t1) / 60000) : null
}

/**
 * Everything usable in the file, in one pass.
 *
 * Two lists come out, because they answer different questions. `stops` are
 * places you were, with a duration — that is what decides where a trip was
 * and what to call it. `points` are every located sample including movement,
 * which is what draws the line across the day's map afterwards.
 */
export function parseTimeline(input, { maxPointsPerDay = 400 } = {}) {
  let data = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch {
      return { format: 'unparseable', stops: [], points: [], skipped: 0 }
    }
  }
  const format = detectFormat(data)
  const stops = []
  const points = []
  let skipped = 0

  const push = (at, ll, extra = {}) => {
    if (!ll || !at) return void skipped++
    points.push({ at, day: localDay(at), lat: ll.lat, lon: ll.lon, ...extra })
  }

  if (format === 'segments') {
    for (const seg of Array.isArray(data) ? data : data.semanticSegments) {
      if (!seg) continue
      const start = seg.startTime
      const end = seg.endTime ?? seg.startTime
      if (seg.visit) {
        const ll = parseLatLng(seg.visit.topCandidate?.placeLocation ?? seg.visit.topCandidate)
        if (ll) {
          stops.push({
            at: start,
            until: end,
            day: localDay(start),
            lat: ll.lat,
            lon: ll.lon,
            minutes: minutesBetween(start, end),
            // The current export gives a place *id* and no name — Google
            // stopped shipping the label when Timeline moved on-device.
            name: seg.visit.topCandidate?.placeLocation?.name ?? null,
          })
          push(start, ll, { stop: true })
        } else skipped++
      } else if (seg.timelinePath) {
        for (const p of seg.timelinePath) {
          const ll = parseLatLng(p.point ?? p)
          const at =
            p.time ??
            (Number.isFinite(Number(p.durationMinutesOffsetFromStartTime)) && start
              ? new Date(
                  Date.parse(start) + Number(p.durationMinutesOffsetFromStartTime) * 60000
                ).toISOString()
              : start)
          push(at, ll)
        }
      } else if (seg.activity) {
        push(start, parseLatLng(seg.activity.start))
        push(end, parseLatLng(seg.activity.end))
      } else skipped++
    }
  } else if (format === 'timelineObjects') {
    for (const obj of data.timelineObjects) {
      const pv = obj?.placeVisit
      const as = obj?.activitySegment
      if (pv) {
        const ll = parseLatLng(pv.location)
        const start = pv.duration?.startTimestamp
        const end = pv.duration?.endTimestamp ?? start
        if (ll && start) {
          stops.push({
            at: start,
            until: end,
            day: localDay(start),
            lat: ll.lat,
            lon: ll.lon,
            minutes: minutesBetween(start, end),
            name: pv.location?.name ?? null,
          })
          push(start, ll, { stop: true })
        } else skipped++
      } else if (as) {
        push(as.duration?.startTimestamp, parseLatLng(as.startLocation))
        for (const w of as.waypointPath?.waypoints ?? []) {
          push(as.duration?.startTimestamp, parseLatLng(w))
        }
        push(as.duration?.endTimestamp, parseLatLng(as.endLocation))
      } else skipped++
    }
  } else if (format === 'records') {
    const rows = Array.isArray(data) ? data : data.locations
    for (const r of rows) {
      const ll = parseLatLng(r)
      const at = r?.timestamp ?? (r?.timestampMs ? new Date(Number(r.timestampMs)).toISOString() : null)
      push(at, ll)
    }
  }

  points.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  stops.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return { format, stops, points: thin(points, maxPointsPerDay), skipped }
}

/**
 * Raw records arrive every few seconds. Nothing downstream is improved by
 * fifteen thousand fixes for one Tuesday, and the day map has to draw them.
 * Keeps every stop, and thins the rest evenly across the day.
 */
function thin(points, perDay) {
  const byDay = new Map()
  for (const p of points) {
    if (!p.day) continue
    if (!byDay.has(p.day)) byDay.set(p.day, [])
    byDay.get(p.day).push(p)
  }
  const out = []
  for (const list of byDay.values()) {
    if (list.length <= perDay) {
      out.push(...list)
      continue
    }
    const keep = list.filter((p) => p.stop)
    const step = list.length / Math.max(1, perDay - keep.length)
    for (let i = 0; i < list.length; i += step) {
      const p = list[Math.floor(i)]
      if (p && !p.stop) keep.push(p)
    }
    keep.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    out.push(...keep)
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

// ------------------------------------------------------------------- home

/**
 * Where you live, according to the file.
 *
 * Counted in *days present*, not in samples: a fortnight's holiday can easily
 * produce more location fixes than a month at home, but it cannot produce
 * more days. The winning cell is averaged rather than taken at its centre so
 * the distance test isn't quantised by the grid.
 */
export function findHome(samples, { cellKm = HOME_CELL_KM } = {}) {
  const cells = new Map()
  for (const s of samples ?? []) {
    if (!Number.isFinite(s?.lat) || !Number.isFinite(s?.lon) || !s.day) continue
    const latStep = cellKm / 111
    const lonStep = latStep / Math.max(0.2, Math.cos((s.lat * Math.PI) / 180))
    const key = `${Math.round(s.lat / latStep)}:${Math.round(s.lon / lonStep)}`
    let cell = cells.get(key)
    if (!cell) cells.set(key, (cell = { days: new Set(), lat: 0, lon: 0, n: 0 }))
    cell.days.add(s.day)
    cell.lat += s.lat
    cell.lon += s.lon
    cell.n++
  }
  let best = null
  for (const cell of cells.values()) {
    if (!best || cell.days.size > best.days.size) best = cell
  }
  if (!best) return null
  return { lat: best.lat / best.n, lon: best.lon / best.n, days: best.days.size }
}

// ------------------------------------------------------------------ trips

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

/**
 * The runs of days spent away from home.
 *
 * Days are classified before they are grouped, which is what lets a day with
 * no data at all mean "don't know" rather than "was at home" — the difference
 * between one trip and two.
 */
export function tripsFromTimeline(
  parsed,
  { home, awayKm = AWAY_KM, mergeGapDays = MERGE_GAP_DAYS, minNights = MIN_NIGHTS } = {}
) {
  const stops = parsed?.stops ?? []
  const points = parsed?.points ?? []
  const all = points.length ? points : stops
  const base = home ?? findHome(all)
  if (!base || !all.length) return { trips: [], dayTrips: [], home: base }

  const days = new Map()
  for (const s of all) {
    if (!s.day || !Number.isFinite(s.lat)) continue
    let d = days.get(s.day)
    if (!d) days.set(s.day, (d = { day: s.day, far: 0, samples: [] }))
    d.far = Math.max(d.far, distanceKm([base.lat, base.lon], [s.lat, s.lon]))
    d.samples.push(s)
  }
  if (!days.size) return { trips: [], dayTrips: [], home: base }

  const sorted = [...days.keys()].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  // Every calendar day across the span, including the ones the phone said
  // nothing about at all.
  const line = []
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const known = days.get(d)
    line.push({ day: d, state: !known ? 'unknown' : known.far > awayKm ? 'away' : 'home' })
  }

  // A short silence between two away days is still the trip.
  for (let i = 0; i < line.length; i++) {
    if (line[i].state !== 'unknown') continue
    let j = i
    while (j < line.length && line[j].state === 'unknown') j++
    const bridged = j - i <= mergeGapDays && line[i - 1]?.state === 'away' && line[j]?.state === 'away'
    if (bridged) for (let k = i; k < j; k++) line[k].state = 'away'
    i = j - 1
  }

  const runs = []
  let run = null
  for (const d of line) {
    if (d.state === 'away') {
      if (!run) runs.push((run = { start: d.day, end: d.day, days: [] }))
      run.end = d.day
      if (days.has(d.day)) run.days.push(days.get(d.day))
    } else run = null
  }

  const described = runs.map((r) => describeTrip(r, stops, base, awayKm))
  return {
    home: base,
    span: { first, last },
    trips: described.filter((t) => t.nights >= minNights),
    dayTrips: described.filter((t) => t.nights < minNights),
  }
}

function describeTrip(run, stops, home, awayKm) {
  const samples = run.days.flatMap((d) => d.samples)
  // A trip is never named after home. The days it starts and ends on both
  // contain the drive to the airport and the supermarket on the way back,
  // and those stops are otherwise perfectly good candidates for the title —
  // which is how a fortnight in Lisbon ends up called "London & Lisbon".
  const abroad = (s) => distanceKm([home.lat, home.lon], [s.lat, s.lon]) > awayKm
  const lats = samples.map((s) => s.lat)
  const lons = samples.map((s) => s.lon)
  const bounds = lats.length
    ? {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLon: Math.min(...lons),
        maxLon: Math.max(...lons),
      }
    : null
  const within = stops.filter((s) => s.day >= run.start && s.day <= run.end && abroad(s))
  return {
    start: run.start,
    end: run.end,
    nights: Math.round((Date.parse(`${run.end}T00:00:00Z`) - Date.parse(`${run.start}T00:00:00Z`)) / DAY),
    days: run.days,
    samples,
    stops: within,
    bounds,
    centre: bounds
      ? { lat: (bounds.minLat + bounds.maxLat) / 2, lon: (bounds.minLon + bounds.maxLon) / 2 }
      : null,
    furthestKm: samples.length
      ? Math.max(...samples.map((s) => distanceKm([home.lat, home.lon], [s.lat, s.lon])))
      : 0,
    places: placesIn(within.length ? within : samples.filter(abroad)),
  }
}

// ----------------------------------------------------------------- naming

/**
 * The nearest city we can name without asking anybody.
 *
 * Reverse geocoding is a key, a rate limit and a network round trip for a
 * string the user is about to read and correct anyway. The airport table is
 * already in the bundle for the globe, and an airport is by construction next
 * to somewhere worth flying to — which is exactly the set of places a trip
 * gets named after. Anywhere with no airport within range gets no name rather
 * than a wrong one.
 */
export function nearestPlace(lat, lon, { maxKm = 140 } = {}) {
  let best = null
  for (const [code, pos] of Object.entries(AIRPORT_COORDS)) {
    const km = distanceKm([lat, lon], pos)
    if (km <= maxKm && (!best || km < best.km)) best = { code, km, name: AIRPORT_CITY[code] || code }
  }
  return best
}

/** The places a trip was spent in, most-dwelt-in first. */
export function placesIn(stops) {
  const seen = new Map()
  for (const s of stops ?? []) {
    if (!Number.isFinite(s?.lat)) continue
    const near = s.name ? { name: s.name, km: 0 } : nearestPlace(s.lat, s.lon)
    if (!near) continue
    const cur = seen.get(near.name) ?? { name: near.name, minutes: 0, days: new Set() }
    cur.minutes += Math.max(s.minutes ?? 0, 0)
    if (s.day) cur.days.add(s.day)
    seen.set(near.name, cur)
  }
  return [...seen.values()]
    .map((p) => ({ name: p.name, minutes: p.minutes, days: p.days.size }))
    .sort((a, b) => b.days - a.days || b.minutes - a.minutes)
}

/** Pre-filled, never written without being shown. */
export function suggestTripTitle(trip) {
  const named = (trip?.places ?? []).slice(0, 2).map((p) => p.name)
  if (named.length) return named.join(' & ')
  if (!trip?.start) return 'A trip'
  const d = new Date(`${trip.start}T00:00:00Z`)
  return `${d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })} ${d.getUTCFullYear()}`
}

export function summariseTrip(trip) {
  if (!trip) return ''
  const when =
    trip.start === trip.end
      ? fmt(trip.start)
      : `${fmt(trip.start)} – ${fmt(trip.end)}`
  const nights = trip.nights === 1 ? '1 night' : `${trip.nights} nights`
  const where = trip.places?.length
    ? trip.places.slice(0, 3).map((p) => p.name).join(', ')
    : `${trip.furthestKm.toLocaleString('en-GB')} km from home`
  return `${when} · ${nights} · ${where}`
}

function fmt(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// ------------------------------------------------------------- day tracks

/**
 * The rows a day map draws from, in the shape `day_tracks` already stores —
 * the same shape the author's own timeline was imported into by hand, so an
 * imported trip gets the identical map rather than a second-class one.
 *
 * Consecutive fixes closer together than a street are dropped: they are GPS
 * jitter while stationary, and they turn a line into a scribble.
 */
// geo.js rounds to whole kilometres, which is right for a flight and useless
// for jitter: everything under 500m would come back as zero.
function metresBetween([lat1, lon1], [lat2, lon2]) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(a))
}

export function dayTracks(trip, { minMoveM = 60 } = {}) {
  return (trip?.days ?? [])
    .map((d) => {
      const path = []
      for (const s of d.samples) {
        const prev = path[path.length - 1]
        if (prev && metresBetween(prev, [s.lat, s.lon]) < minMoveM) continue
        path.push([Number(s.lat.toFixed(5)), Number(s.lon.toFixed(5))])
      }
      const visits = (trip.stops ?? [])
        .filter((s) => s.day === d.day && (s.minutes ?? 0) >= MIN_STOP_MINUTES)
        .map((s) => ({
          lat: Number(s.lat.toFixed(5)),
          lon: Number(s.lon.toFixed(5)),
          t: localTime(s.at),
          e: localTime(s.until ?? s.at),
          min: s.minutes ?? 0,
        }))
      return { track_date: d.day, path, visits }
    })
    .filter((t) => t.path.length > 1 || t.visits.length)
}
