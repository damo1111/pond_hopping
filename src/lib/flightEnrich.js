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

/**
 * How far back each source can see, in days.
 *
 * A fact about the source, not about the plan: AeroDataBox answers "must not
 * be earlier than 365 day(s) ago" on every tier it sells, free and paid.
 *
 * Written down because the backfill needs it. Asking a source about a date
 * it has told you it cannot reach wastes a request at best, and at worst —
 * as happened — the refusal gets recorded as an answer and the flight is
 * retired from every future source too.
 *
 * Cirium is deliberately null rather than a number. Its historical
 * entitlement is not something to guess at, and a reach set too short here
 * would silently skip the 2009 flights — the exact flights it is being paid
 * to reach. Null means ask about everything and let it refuse, which is now
 * safe: a refusal records nothing.
 */
export const REACH = { aerodatabox: 365, cirium: null }

/** Fields a source may fill. Everything else on a flight is untouchable. */
export const FILLABLE = [
  'airline',
  'registration',
  'aircraft_type_id',
  'aircraft_model',
  'call_sign',
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

/**
 * How far apart two numbers may be and still be the same number.
 *
 * Set from the real thing rather than by feel, once 105 flights had been
 * filled in and the disagreements could be read. Two sources measuring the
 * same leg land within six per cent of each other — KUL–SIN came back as 316
 * and 297, DOH–HIA as 6,487 and 6,208 — because they differ on where an
 * airport is and whether to allow for the routing. None of that is worth
 * telling anybody about.
 *
 * The two real disagreements were not close calls: LGA–DCA at 345 against
 * 775, and SYD–HND at 7,817 against 15,053, both cases of the source having
 * matched the wrong flight entirely. Noise tops out at 6%, signal starts at
 * 93%, and the line goes in the empty space between them.
 *
 * At the old 2% all four of the honest pairs were reported as conflicts,
 * which is the failure mode that teaches people to ignore a warning.
 */
export const CLOSE_ENOUGH = 0.1

const same = (a, b) => {
  if (empty(a) || empty(b)) return true
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim().toLowerCase() === b.trim().toLowerCase()
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const x = Number(a)
    const y = Number(b)
    // Distances from two sources are never identical and never need to be.
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return Math.abs(x - y) <= Math.max(1, Math.abs(x) * CLOSE_ENOUGH)
    }
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

  // An answer describing a different day is not this flight.
  //
  // askAbout() stops the wrong question being asked; this refuses the answer
  // if it comes back describing a different day anyway. Both are needed: the
  // wrong-day reply was a well-formed, plausible, entirely real flight, so
  // nothing about validating its *shape* would have caught it, and a future
  // source with its own idea of what a date means walks straight back into
  // it otherwise.
  //
  // Dropped rather than recorded as a disagreement. A disagreement means
  // "you and the airline remember this differently", which is worth showing
  // somebody. This means "we fetched the wrong aeroplane", which is not.
  for (const key of ['actual_dep_time', 'actual_arr_time']) {
    const scheduled = key === 'actual_dep_time' ? flight.dep_time : flight.arr_time
    if (patch[key] && !believable(scheduled, patch[key])) delete patch[key]
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
 *
 * `reach` is how many days back this particular source can see. A source
 * that says in writing it cannot look past 365 days should not be asked
 * about 2022: three hundred and seventy refusals is rude to a free tier,
 * slow on a paid one, and — before this — actively harmful, because each
 * refusal was being written down as an answer. Left out, nothing is skipped
 * on age, which is the right default for a source with no such limit.
 */
export function worthAsking(flights = [], { now = new Date(), reach = null } = {}) {
  const floor = reach ? now.valueOf() - reach * 86400000 : null
  return flights.filter((f) => {
    if (!f?.flight_number || !f?.dep_time) return false
    if (f.enriched_at) return false
    const when = Date.parse(f.dep_time)
    if (!(when < now.valueOf())) return false
    return floor == null || when >= floor
  })
}

// ── Which day to ask about ───────────────────────────────────────────────
//
// This is the one that got seventeen flights wrong.
//
// The call site did `String(f.dep_time).slice(0, 10)` — the first ten
// characters of a `timestamptz`, which is the date **in UTC**. Every flight
// source keys its schedules on the date **local to the departure airport**,
// because that is the date on the boarding pass and the date the airline
// calls it. Those two agree for most of the world most of the time, and
// disagree for exactly the flights this app is full of: long-haul, at the
// edges of the day, out of the eastern hemisphere.
//
// MH146 leaves Melbourne at 08:45 on 3 April, which is 21:45Z on the 2nd.
// We asked for the 2nd, and were correctly given the aircraft that left
// Melbourne on the 2nd — a real flight, a day early. Nothing errored. It
// was written down as the actual departure of a flight taken on the 3rd,
// and the app showed a trip beginning a day before it began.
//
// The tell in the data is a 24-hour "delay". A departure genuinely 24 hours
// late is not a delay, it is a cancellation and a rebooking.

/**
 * The date to ask a flight source about: the local calendar date at the
 * departure airport, as YYYY-MM-DD.
 *
 * @param depTime  the scheduled departure, as an instant
 * @param zone     an IANA zone, or an offset in hours, for the origin
 *
 * Falls back to the UTC date when the zone is unknown, which is what it
 * always did — but now that is the exception rather than the rule.
 */
export function askAbout(depTime, zone) {
  if (!depTime) return null
  const at = new Date(depTime)
  if (Number.isNaN(at.getTime())) return null
  if (typeof zone === 'string' && zone) {
    try {
      // en-CA renders as YYYY-MM-DD, which is the format being asked for.
      return at.toLocaleDateString('en-CA', { timeZone: zone })
    } catch {
      /* an unknown zone name falls through to the offset path */
    }
  }
  const hours = Number.isFinite(zone) ? zone : 0
  return new Date(at.getTime() + hours * 3600000).toISOString().slice(0, 10)
}

/**
 * How far an "actual" may sit from its schedule before it is not a delay.
 *
 * Six hours is generous — it is beyond nearly every real delay — and the
 * thing being caught is a whole day, so the exact figure does not have to
 * be argued about. What matters is that the guard exists: the wrong-day
 * answer was a well-formed, plausible, entirely real flight, and no amount
 * of validating its *shape* would ever have caught it.
 */
export const NOT_A_DELAY_MS = 6 * 3600 * 1000

/**
 * Is this "actual" time believable as the same flight?
 *
 * Belt and braces with askAbout(): that fixes the question being asked, and
 * this refuses the answer if it comes back describing a different day. A
 * future source with its own idea of what a date means cannot reintroduce
 * the same bug quietly.
 */
export function believable(scheduled, actual, gap = NOT_A_DELAY_MS) {
  if (!scheduled || !actual) return true
  const a = Date.parse(scheduled)
  const b = Date.parse(actual)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true
  return Math.abs(b - a) <= gap
}
