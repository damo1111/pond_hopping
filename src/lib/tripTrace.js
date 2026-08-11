// The whole trip, as it was recorded, with nothing taken out.
//
// Everything before this file was an apparatus for keeping coordinates away
// from the model: Foursquare lookups, candidate shortlists, CLOSE_M,
// CLEARLY_NEARER, TRUST_PHOTO, STAYED_MINUTES, a centroid per segment. All
// of it rested on the assumption that a model cannot be trusted with a raw
// latitude and longitude, and that assumption was simply wrong.
//
// Given 41.8932, 12.4874 a model says "the northern part of the Roman Forum
// archaeological zone". Foursquare, at the Colosseum, said "La Cenatio
// Rotunda". At Piazza Navona it said "Obelisco Agonalis". The venue
// database was worse than the world knowledge it was there to replace, and
// tuning it was effort spent in the wrong place entirely.
//
// So: no geocoding. The trace goes over whole.
//
// What that costs. Three hundred photographs is about twelve kilobytes of
// times and coordinates — three or four thousand tokens for an entire trip,
// in one call. The version this replaces spent thirty-one map lookups, six
// vision calls and four writing calls per trip. This is cheaper as well as
// better, which is usually the sign that the earlier design was solving a
// problem it had invented.
//
// What the trace has to keep, because each of these turned out to carry the
// story:
//
//   every point, not a centroid — the sequence 12.4948, 12.4913, 12.4895,
//     12.4887, 12.4863 is somebody walking west towards Piazza Venezia, and
//     averaging it to one dot destroys exactly that
//   photographs with a time and no fix — two of those at 18:04 and 18:17 on
//     a travel day are somebody on an aeroplane, and dropping them loses the
//     flight
//   the gaps — four hours with no photographs is a fact about the day, and
//     naming it honestly beats filling it
//   how far apart the fixes are — the sum of the straight lines is a floor
//     on how far somebody walked, and it is arithmetic nobody was doing

import { metresApart } from './photoDays.js'
import { clockIn } from './localTime.js'
import { words } from './sport.js'

/** Longer than this without a photograph is a hole worth naming. */
export const GAP_HOURS = 2

const iso = (t) => String(t ?? '')
const km = (m) => Math.round((m / 1000) * 10) / 10

/**
 * One day's photographs, in order, as rows a model can read.
 *
 * Coordinates keep five decimals — about a metre — because the difference
 * between the north and south side of the Colosseum is the difference
 * between two sentences.
 */
export function rowsFor(photos = [], zone = null) {
  return [...photos]
    .filter((p) => p?.taken_at)
    .sort((a, b) => iso(a.taken_at).localeCompare(iso(b.taken_at)))
    .map((p) => ({
      // Carried so an observation from the seeing pass can land beside the
      // minute and the coordinate it belongs to.
      id: p.id ?? null,
      at: clockIn(p.taken_at, zone),
      lat: p.lat == null ? null : Number(p.lat.toFixed(5)),
      lon: p.lon == null ? null : Number(p.lon.toFixed(5)),
    }))
}

/** Stretches of a day with no photographs at all. Not filled in — named. */
export function gapsIn(rows = [], hours = GAP_HOURS) {
  const out = []
  for (let i = 0; i < rows.length - 1; i++) {
    const mins = minutesBetween(rows[i].at, rows[i + 1].at)
    if (mins >= hours * 60) out.push({ from: rows[i].at, to: rows[i + 1].at, minutes: mins })
  }
  return out
}

function minutesBetween(a, b) {
  const [ah, am] = String(a).split(':').map(Number)
  const [bh, bm] = String(b).split(':').map(Number)
  if ([ah, am, bh, bm].some((n) => !Number.isFinite(n))) return 0
  return bh * 60 + bm - (ah * 60 + am)
}

/**
 * Faster than this between two photographs and you were not on your feet.
 *
 * Distance alone is the wrong test. Day one of Rome summed to 1,982 km,
 * which is obviously the flight; capping the hop length at thirty
 * kilometres still left 24 km, because two of the photographs are twenty-
 * three kilometres apart in Scotland three minutes apart — a car, at four
 * hundred and sixty kilometres an hour. Speed catches both, and it leaves
 * the awkward middle alone: the three-and-a-half kilometre jump up the
 * Tiber at 07:50 took twenty minutes, which is ten an hour, which is a
 * person moving.
 */
export const ON_FOOT_KMH = 15

/**
 * The floor on how far somebody moved under their own steam: straight lines
 * between consecutive fixes, minus the hops nobody could have covered on
 * foot. Real streets curve and walking carries on between photographs, so
 * this is always an understatement, and it must be described as one.
 *
 * Takes photographs rather than formatted rows, because it needs the real
 * instants — "13:16" and "13:20" cannot tell you a hop crossed midnight or
 * how many seconds it took.
 */
export function groundCovered(photos = []) {
  const order = [...photos]
    .filter((p) => p?.taken_at && p.lat != null && p.lon != null)
    .sort((a, b) => iso(a.taken_at).localeCompare(iso(b.taken_at)))

  let m = 0
  for (let i = 1; i < order.length; i++) {
    const hop = metresApart(order[i - 1], order[i])
    const hours = Math.abs(new Date(order[i].taken_at) - new Date(order[i - 1].taken_at)) / 3600000
    // Two photographs in the same second at different places is a bad fix,
    // not infinite speed. No time elapsed means no evidence either way.
    if (!hours) continue
    if (hop / 1000 / hours <= ON_FOOT_KMH) m += hop
  }
  return km(m)
}

/**
 * Everything known about a trip, in one object, for one call.
 *
 * @param photos   rows from the photos table — taken_at, lat, lon, taken_on
 * @param trip     the trip row, for its dates and title
 * @param extras   { flights, runs, zone }
 */
/**
 * Where somebody actually was, as opposed to where they took a photograph.
 *
 * Two sources, one shape. `day_tracks.visits` is what a Google Timeline
 * export knew — stays with an arrival, a departure and a duration, already
 * in local clock time. `location_visits` is what this app recorded itself
 * when somebody turned it on.
 *
 * This is the thing the photographs cannot give you. A trace built from
 * pictures alone goes quiet whenever the camera does, and the reconstruction
 * has to say so — "I stopped somewhere near the Trevi for the best part of
 * an hour and I genuinely cannot tell you what I was doing". Half of those
 * hours are not a mystery at all: something was recording the whole time.
 *
 * It is evidence of presence and nothing more. Four hours at a coordinate
 * says where somebody was, never what they were doing there, and the
 * reconstruction is told so in as many words.
 */
export function staysOn(date, { tracks = [], visits = [], zone = null } = {}) {
  const out = []

  for (const t of tracks) {
    if (t?.track_date !== date) continue
    for (const v of t.visits ?? []) {
      if (v?.lat == null || v?.lon == null) continue
      out.push({
        from: v.t ?? null,
        to: v.e ?? null,
        minutes: Number(v.min) || null,
        lat: Number(v.lat.toFixed(5)),
        lon: Number(v.lon.toFixed(5)),
        how: 'timeline',
      })
    }
  }

  for (const v of visits) {
    const day = iso(v?.arrived_at).slice(0, 10)
    if (day !== date || v?.lat == null || v?.lng == null) continue
    const minutes =
      v.arrived_at && v.departed_at
        ? Math.round((new Date(v.departed_at) - new Date(v.arrived_at)) / 60000)
        : null
    out.push({
      from: v.arrived_at ? clockIn(v.arrived_at, zone) : null,
      to: v.departed_at ? clockIn(v.departed_at, zone) : null,
      minutes: minutes && minutes > 0 ? minutes : null,
      lat: Number(Number(v.lat).toFixed(5)),
      lon: Number(Number(v.lng).toFixed(5)),
      how: v.source === 'manual' ? 'noted' : 'recorded',
    })
  }

  return out.sort((a, b) => String(a.from ?? '').localeCompare(String(b.from ?? '')))
}

export function traceOf(
  photos = [],
  trip = {},
  { flights = [], runs = [], zone = null, tracks = [], visits = [] } = {}
) {
  const byDay = new Map()
  for (const p of photos) {
    const d = p?.taken_on || iso(p?.taken_at).slice(0, 10)
    if (!d) continue
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d).push(p)
  }
  // A travel day where nobody took a picture still has its flight.
  for (const f of flights) {
    const d = iso(f?.dep_time).slice(0, 10)
    if (d && !byDay.has(d)) byDay.set(d, [])
  }
  for (const r of runs) if (r?.run_date && !byDay.has(r.run_date)) byDay.set(r.run_date, [])
  // A day somebody was somewhere and photographed nothing is still a day.
  for (const t of tracks) if (t?.track_date && !byDay.has(t.track_date)) byDay.set(t.track_date, [])
  for (const v of visits) {
    const d = iso(v?.arrived_at).slice(0, 10)
    if (d && !byDay.has(d)) byDay.set(d, [])
  }

  const dates = [...byDay.keys()].sort()
  const start = trip.start_date || dates[0]

  const days = dates.map((date) => {
    const rows = rowsFor(byDay.get(date), zone)
    const located = rows.filter((r) => r.lat != null)
    return {
      date,
      day_number: start
        ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1
        : null,
      photographs: rows.length,
      // Photographs that kept a time and lost their fix. On a travel day
      // these are somebody in the air, and they are evidence, not noise.
      without_gps: rows.length - located.length,
      first: rows[0]?.at ?? null,
      last: rows[rows.length - 1]?.at ?? null,
      km_on_foot: groundCovered(byDay.get(date) ?? []),
      gaps: gapsIn(rows),
      flights: flights
        .filter((f) => iso(f?.dep_time).slice(0, 10) === date)
        .map((f) => ({
          number: f.flight_number,
          from: f.dep_airport,
          to: f.arr_airport,
          departed: f.dep_time ? clockIn(f.dep_time, zone) : null,
          arrived: f.arr_time ? clockIn(f.arr_time, zone) : null,
        })),
      activities: runs
        .filter((r) => r?.run_date === date)
        .map((r) => ({
          kind: words(r.sport).one,
          km: Number(r.distance_km) || null,
          pace: r.pace ?? null,
          climb_m: Number(r.elevation_m) || null,
        })),
      // Where they were, from whatever was recording — which is often the
      // answer to a gap the photographs leave open.
      stayed: staysOn(date, { tracks, visits, zone }),
      // The day itself. Every photograph, in order, at full precision.
      trace: rows,
    }
  })

  return {
    trip: trip.title ?? null,
    from: start ?? null,
    to: trip.end_date || dates[dates.length - 1] || null,
    timezone: zone,
    photographs: days.reduce((n, d) => n + d.photographs, 0),
    days,
  }
}
