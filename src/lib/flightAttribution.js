// Who was on which flight, worked out by asking as few questions as possible.
//
// The naive version of this screen asks "who flew this?" about every row and
// starts from nothing, which for an imported logbook is 821 questions and a
// user who quits at 30. It's also the wrong question: you imported these
// into *your* logbook, so the honest default is you. The interesting cases
// are the ones where that default is provably wrong.
//
// Two things prove it. A person can't be on two aeroplanes at once, and a
// person can't depart from an airport their last flight didn't land at. Any
// flight caught by either is one the app genuinely doesn't know about — and
// everything else can be left alone and silently attributed.
//
// The useful part is that answers propagate. Say a flight wasn't yours and
// it stops conflicting with its overlap, and the continuity chain re-knits
// across the hole it left, so neighbours that looked wrong come right on
// their own. The queue shrinks faster than one per answer, and it ends.

export const ASSUMED = null // travellers not set: assume the account owner

export const isMine = (flight, email) =>
  flight.travellers == null || flight.travellers.some((e) => e.toLowerCase() === email.toLowerCase())

// Long enough to clear an airport, get across a city and check in again.
// Below this a "connection" is really two different people's flights.
const MIN_CONNECTION_MS = 45 * 60 * 1000

/**
 * Flights the owner is currently believed to have been on, in departure
 * order — the set any impossibility has to be judged against.
 */
export function claimedBy(flights, email) {
  return flights
    .filter((f) => f.status !== 'cancelled' && isMine(f, email))
    .sort((a, b) => (a.dep_time || '').localeCompare(b.dep_time || ''))
}

/**
 * Every way the owner's itinerary contradicts itself. Each conflict names
 * the two flights involved, because the question to ask is always "which of
 * these two was you?" rather than "was this you?" in the abstract.
 */
export function findConflicts(flights, email) {
  const mine = claimedBy(flights, email)
  const conflicts = []

  // In the air twice at once. Only compares against later departures, and
  // stops as soon as one starts after this flight lands, so the scan stays
  // linear in practice rather than quadratic across nine hundred rows.
  for (let i = 0; i < mine.length; i++) {
    const a = mine[i]
    if (!a.dep_time || !a.arr_time) continue
    for (let j = i + 1; j < mine.length; j++) {
      const b = mine[j]
      if (!b.dep_time) continue
      if (b.dep_time >= a.arr_time) break
      conflicts.push({ kind: 'overlap', a, b })
    }
  }

  // Two flights that overlap also, necessarily, look like a teleport: the
  // second departs somewhere the first hasn't landed yet. That's one
  // contradiction described twice, and counting it twice both inflates what
  // the reader is told is outstanding and skews which flight gets asked
  // about. The overlap is the more explanatory of the two, so it wins.
  const overlapping = new Set(conflicts.map((c) => `${c.a.id}|${c.b.id}`))

  // Departing somewhere you aren't. Teleporting is only *impossible* when
  // there wasn't time to fly the gap commercially; a break with days of
  // slack is just a train, a car or a missing row, so it's reported as a
  // softer signal rather than a contradiction.
  for (let i = 1; i < mine.length; i++) {
    const prev = mine[i - 1]
    const cur = mine[i]
    if (!prev.arr_airport || !cur.dep_airport || prev.arr_airport === cur.dep_airport) continue
    if (overlapping.has(`${prev.id}|${cur.id}`)) continue
    const gap = Date.parse(cur.dep_time) - Date.parse(prev.arr_time || prev.dep_time)
    if (Number.isNaN(gap)) continue
    conflicts.push({
      kind: gap < MIN_CONNECTION_MS ? 'teleport' : 'gap',
      a: prev,
      b: cur,
      gapMs: gap,
    })
  }

  return conflicts
}

/**
 * The single flight worth asking about next: the one whose removal settles
 * the most contradictions. Ties break towards the more recent flight, which
 * is the one a person stands a chance of remembering.
 */
export function nextQuestion(flights, email, skip = new Set()) {
  const conflicts = findConflicts(flights, email).filter((c) => c.kind !== 'gap')
  if (!conflicts.length) return null

  const score = new Map()
  for (const c of conflicts) {
    for (const f of [c.a, c.b]) score.set(f.id, (score.get(f.id) || 0) + 1)
  }

  // A skipped flight stays in the graph — the contradiction is still real —
  // but stops being the one asked about, so the same clash gets raised from
  // the other side instead of quietly disappearing along with its partner.
  let best = null
  for (const c of conflicts) {
    for (const f of [c.a, c.b]) {
      if (skip.has(f.id)) continue
      const n = score.get(f.id)
      if (!best || n > best.n || (n === best.n && f.dep_time > best.flight.dep_time)) {
        best = { flight: f, n }
      }
    }
  }
  if (!best) return null

  const involved = conflicts.filter((c) => c.a.id === best.flight.id || c.b.id === best.flight.id)
  return {
    flight: best.flight,
    // What it clashes with, which is the context that makes the question
    // answerable: "you were already over the Atlantic" beats "was this you?"
    against: involved.map((c) => ({
      kind: c.kind,
      other: c.a.id === best.flight.id ? c.b : c.a,
      gapMs: c.gapMs,
    })),
    remaining: new Set(conflicts.flatMap((c) => [c.a.id, c.b.id])).size,
  }
}

/**
 * Flights matching the same pattern as this one — same carrier and route.
 * Someone who tracked a friend's Alaska Airlines hops tracked all of them,
 * so one answer should be offered for the whole habit.
 */
export function samePattern(flights, flight, email) {
  const carrier = (flight.flight_number || '').replace(/\d+$/, '')
  if (!carrier) return []
  return flights.filter(
    (f) =>
      f.id !== flight.id &&
      f.status !== 'cancelled' &&
      f.travellers_confirmed_at == null &&
      isMine(f, email) &&
      f.dep_airport === flight.dep_airport &&
      f.arr_airport === flight.arr_airport &&
      (f.flight_number || '').replace(/\d+$/, '') === carrier
  )
}

/** Kilometres the owner can currently claim as their own. */
export function claimedKm(flights, email) {
  return claimedBy(flights, email).reduce((s, f) => s + (f.distance_km || 0), 0)
}
