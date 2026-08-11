// Filling in a flight without arguing with the person who was on it.
//
// Two sources of truth and they are not equal. What somebody recorded — the
// cabin they sat in, the seat, the registration they read off the safety
// card — is testimony. What an API returns is a very good record of what an
// aeroplane did, and it has been wrong about which aeroplane, which cabin
// and which day often enough that it does not get to overrule anybody.
//
// So: fill what is empty, keep what is there, and where the two disagree,
// keep both and say so. A seat in a cabin the aircraft does not have is
// usually an equipment swap, and that is a thing worth telling somebody
// about rather than a conflict to settle silently.
//
// The same shape works for ByAir now and AeroAPI later. Nothing here knows
// or cares which one answered.

/** Fields a source may fill. Everything else on a flight is untouchable. */
export const FILLABLE = [
  'airline',
  'registration',
  'aircraft_type_id',
  'cabin',
  'seat',
  'distance_km',
  'actual_dep_time',
  'actual_arr_time',
  'gate_dep',
  'gate_arr',
  'terminal_dep',
  'terminal_arr',
  'track',
]

/** Fields that are only ever the source's to give — nobody types these. */
const ONLY_THEIRS = new Set([
  'actual_dep_time',
  'actual_arr_time',
  'gate_dep',
  'gate_arr',
  'terminal_dep',
  'terminal_arr',
  'track',
])

const empty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length)

const same = (a, b) => {
  if (empty(a) || empty(b)) return true
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim().toLowerCase() === b.trim().toLowerCase()
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const x = Number(a)
    const y = Number(b)
    // Distances from two sources are never identical and never need to be.
    if (Number.isFinite(x) && Number.isFinite(y)) return Math.abs(x - y) <= Math.max(1, x * 0.02)
  }
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * What to write, given what is on the flight and what came back.
 *
 * @param flight  the row as it stands
 * @param found   whatever the source knows, in the same column names
 * @param from    who answered, for enriched_from
 * @returns { patch, disagreed } — patch is empty when there is nothing to do
 */
export function enrichment(flight = {}, found = {}, from = 'unknown') {
  const patch = {}
  const disagreed = []

  for (const key of FILLABLE) {
    const theirs = found[key]
    if (empty(theirs)) continue
    const ours = flight[key]

    if (empty(ours)) {
      patch[key] = theirs
      continue
    }
    // Held by us and only ever theirs to give: they win, because nobody
    // typed a gate number in by hand.
    if (ONLY_THEIRS.has(key)) {
      patch[key] = theirs
      continue
    }
    // Held by us and ours to keep. Recorded where it differs, never changed.
    if (!same(ours, theirs)) disagreed.push({ field: key, ours, theirs })
  }

  const anything = Object.keys(patch).length > 0 || disagreed.length > 0
  if (!anything) return { patch: {}, disagreed: [] }

  return {
    patch: {
      ...patch,
      enriched_at: new Date().toISOString(),
      enriched_from: from,
      ...(disagreed.length ? { disagreed } : {}),
    },
    disagreed,
  }
}

/**
 * Which flights are worth asking about.
 *
 * Historical flight data does not change, so one that has been asked about
 * is never asked again — which is the whole reason a paid API stays at one
 * query per flight for ever rather than one per page view.
 *
 * A flight with no number cannot be looked up by any source, and asking
 * about one that has not happened yet gets a schedule, not a record.
 */
export function worthAsking(flights = [], { now = new Date() } = {}) {
  return flights.filter((f) => {
    if (!f?.flight_number || !f?.dep_time) return false
    if (f.enriched_at) return false
    return Date.parse(f.dep_time) < now.valueOf()
  })
}
