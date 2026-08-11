// Working out how somebody got from one place to another, from the fact that
// they were suddenly somewhere else.
//
// The evidence is a trace: photographs with a time and a coordinate, and
// stays recorded by whatever was running in their pocket. Between two of
// those fixes there is sometimes a hole that a person could not have walked,
// driven or swum across, and on the far side of it they are in another
// country. That hole is a leg, and almost everything about it is recoverable
// without anybody typing anything in.
//
// What this file does and does not claim
// ─────────────────────────────────────
// It narrows. It does not decide. A photograph is the third rung of the
// evidence ladder — testimony, then recorded stays, then photographs, then
// inference — and nothing deduced here may present itself as recorded. So
// the strongest verdict this file will ever return is `likely`. `confirmed`
// belongs to a service that answered, or to a person who said so.
//
// The output is therefore two things, and the second is the important one:
//
//   legs   what it thinks happened, ranked, each with its reasons
//   ask    the question to put to a timetable — mode, both ends, a window
//
// `ask` is the point. A trace that says "left Heathrow Terminal 5 between
// 15:55 and 19:46, arrived at an airport serving Rome" turns into a lookup
// with one or two answers, and that is the difference between a travel log
// somebody has to fill in and one that fills itself in.
//
// Why speed never chooses the mode
// ────────────────────────────────
// It is tempting: aeroplanes are fast, trains are slower, cars are slower
// still. But the number available here is the average over the gap between
// two fixes, and that gap contains the taxi to the airport, the queue at
// security, and the walk to the hotel at the other end. Edinburgh to
// Heathrow, door to door, averages slower than the Beijing train. Measured
// this way a short flight and a long train are indistinguishable, and any
// rule built on the number alone will be confidently wrong twice a trip.
//
// So the average is used one way only — to **rule out**. It is always an
// understatement, because a great circle is shorter than the real route and
// the fixes bracket more than the journey. An understatement above a mode's
// ceiling is proof that mode is impossible. Below it, it proves nothing.
//
// What chooses the mode is where the person was standing. Shanghai Hongqiao
// railway station and Shanghai Hongqiao airport are one and a half
// kilometres apart and share a name, and the whole answer to "was this a
// train or a flight" is which of the two the geotag is sitting on.

import {
  BANDS,
  CLEARLY_NEARER,
  MODES,
  ON_FOOT_KMH,
  bandFor,
  kmApart,
  nodesNear,
  partAt,
  zoneAt,
} from './legs.js'
import { offsetOfZone } from './localTime.js'

/**
 * Short enough that a fast hop is a bad fix or a stretch of motorway rather
 * than a journey between two places.
 *
 * Sixty kilometres is about the distance from the middle of a city to its
 * furthest airport, which is the thing this most needs not to mistake for a
 * leg.
 */
export const CROSSING_KM = 60

/** Anything above this between two fixes was not somebody on the ground. */
export const CROSSING_KMH = MODES.road.ceiling

/**
 * Above this, nothing was moving — the trace is wrong.
 *
 * This is a straight-line average across the whole gap between two fixes,
 * so it is always below the true ground speed, and airliners top out around
 * 1,000 with a strong tailwind. A Guangzhou–Shanghai crossing in this
 * archive comes out at 1,399 km/h, and the cause is a Timeline visit
 * recorded as ending four hours after the aeroplane it was waiting for had
 * already landed.
 *
 * Not filtered out. Named. A trace that contradicts itself is a fact worth
 * showing somebody, and quietly dropping it would leave a real journey
 * missing with no explanation.
 */
export const IMPOSSIBLE_KMH = 1200

const iso = (t) => String(t ?? '')
const ms = (t) => Date.parse(iso(t))

/**
 * Photographs and recorded stays, as one ordered list of "was here, then".
 *
 * A stay contributes two fixes at the same coordinate — when it began and
 * when it ended — and the second is the one that matters, because "left
 * Hongqiao at 08:00" is a far tighter bound on a departure than the last
 * photograph taken there.
 */
export function fixesFrom({ photos = [], stays = [] } = {}) {
  const out = []
  for (const p of photos) {
    if (!p?.taken_at || p.lat == null || p.lon == null) continue
    out.push({ at: new Date(p.taken_at).toISOString(), lat: Number(p.lat), lon: Number(p.lon), how: 'photograph' })
  }
  for (const s of stays) {
    if (s?.lat == null || s.lon == null) continue
    const lat = Number(s.lat)
    const lon = Number(s.lon)
    if (s.arrived_at) out.push({ at: new Date(s.arrived_at).toISOString(), lat, lon, how: 'arrived' })
    if (s.departed_at) out.push({ at: new Date(s.departed_at).toISOString(), lat, lon, how: 'left' })
  }
  return out.sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * A Google Timeline day, as fixes.
 *
 * The export keeps local clock times with no offset on them — "08:00" and
 * "→05:38", where the arrow means it ran past midnight. Getting the offset
 * wrong by an hour is survivable; getting the day wrong is not, which is
 * why the arrow is honoured rather than ignored.
 *
 * **Each visit gets its own zone, from its own coordinate.** Passing one
 * zone for a trip is the obvious thing and it is wrong: a day that starts
 * in Beijing and ends in Tokyo has its two clock times an hour apart in a
 * way no trip-level zone can express, and every multi-country day in this
 * archive is one of those. `zone` still overrides, for a caller that knows
 * better than the coordinate does.
 */
export function stayFixes(tracks = [], zone = null) {
  const stays = []
  for (const t of tracks) {
    if (!t?.track_date) continue
    for (const v of t.visits ?? []) {
      if (v?.lat == null || v?.lon == null) continue
      const here = zone ?? zoneAt([v.lat, v.lon])
      stays.push({
        lat: v.lat,
        lon: v.lon,
        arrived_at: instantOf(t.track_date, v.t, here),
        departed_at: instantOf(t.track_date, v.e, here),
      })
    }
  }
  return fixesFrom({ stays })
}

/** A date, a local clock time and a zone, as an instant. */
export function instantOf(date, clock, zone) {
  const said = String(clock ?? '')
  if (!date || !/\d{1,2}:\d{2}/.test(said)) return null
  const [h, m] = said.replace('→', '').split(':').map(Number)
  const day = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(day.valueOf())) return null
  // The arrow means it ended the next morning.
  if (said.startsWith('→')) day.setUTCDate(day.getUTCDate() + 1)
  const local = new Date(day.getTime() + (h * 60 + m) * 60000)
  const offset = typeof zone === 'string' ? offsetOfZone(zone, local) : Number(zone)
  return new Date(local.getTime() - (Number.isFinite(offset) ? offset : 0) * 3600000).toISOString()
}

/**
 * The holes nobody crossed on the ground.
 *
 * Consecutive fast segments are merged into one crossing, and that is not a
 * tidiness measure — it is the difference between right and wrong. Somebody
 * who photographs the wing twice out of an aeroplane window produces three
 * fast segments for one flight, and treating them as three legs invents two
 * journeys that never happened. Merging also improves the answer: the fix
 * before the first fast segment is nearer the airport than the one in the
 * middle of Lanarkshire at eleven thousand feet.
 */
export function crossingsIn(fixes = [], { minKm = CROSSING_KM, minKmh = CROSSING_KMH } = {}) {
  const out = []
  let open = null

  for (let i = 1; i < fixes.length; i++) {
    const a = fixes[i - 1]
    const b = fixes[i]
    const km = kmApart([a.lat, a.lon], [b.lat, b.lon])
    const hours = (ms(b.at) - ms(a.at)) / 3600000
    // Two fixes at the same instant in different places is a bad fix, not
    // infinite speed. No time elapsed is no evidence either way.
    const fast = hours > 0 && km / hours > minKmh

    if (fast) {
      open = open ? { ...open, to: b } : { from: a, to: b }
      continue
    }
    if (open) {
      out.push(close(open))
      open = null
    }
  }
  if (open) out.push(close(open))

  return out.filter((c) => c.km >= minKm)
}

function close({ from, to }) {
  const km = kmApart([from.lat, from.lon], [to.lat, to.lon])
  const hours = (ms(to.at) - ms(from.at)) / 3600000
  return {
    from,
    to,
    km: Math.round(km),
    hours: Math.round(hours * 100) / 100,
    kmh: hours > 0 ? Math.round(km / hours) : null,
  }
}

/** Modes the measured average does not rule out. Air is never ruled out by
 *  being slow, because most of a short flight is spent on the ground. */
export function modesFor(kmh) {
  return Object.entries(MODES)
    .filter(([, m]) => m.ceiling == null || !Number.isFinite(kmh) || kmh <= m.ceiling)
    .map(([name]) => name)
}

/** How well one end of a crossing sits on a node of a given kind. */
function endFor(fix, kind) {
  if (!kind) return { kind: null, node: null, part: null, band: 'far', near: [] }
  const near = nodesNear([fix.lat, fix.lon], { kind, within: BANDS[kind].serves })
  const best = near[0] ?? null
  const band = best ? bandFor(kind, best.km) : 'far'
  return {
    kind,
    // Only `at` names the node outright. `near` means the node that serves
    // this place, which is a different and weaker claim — and where there
    // are two of them, as at Rome, it is not a claim at all until something
    // with a timetable settles it.
    node: band === 'at' ? best : null,
    part: band === 'at' ? partAt(best, [fix.lat, fix.lon]) : null,
    band,
    km: best ? Math.round(best.km * 100) / 100 : null,
    near: near.slice(0, 4).map((n) => ({ code: n.code, name: n.name, city: n.city, km: Math.round(n.km * 10) / 10 })),
  }
}

const POINTS = { at: 3, near: 1, far: 0 }

/**
 * What this crossing was, ranked, with the question to ask about it.
 *
 * Each mode is scored on where the two ends sit relative to *its* kind of
 * node, plus a bonus wherever its node is clearly nearer than any other
 * mode's. That bonus is what separates Shanghai Hongqiao's railway station
 * from Shanghai Hongqiao's airport: four hundred metres against two
 * kilometres, at the same place, with the same name.
 */
export function deduce(crossing) {
  const possible = modesFor(crossing.kmh)
  const kinds = [...new Set(Object.values(MODES).map((m) => m.kind).filter(Boolean))]

  // Every kind at both ends first, so "clearly nearer" has something to
  // compare against.
  const ends = { from: {}, to: {} }
  for (const kind of kinds) {
    ends.from[kind] = endFor(crossing.from, kind)
    ends.to[kind] = endFor(crossing.to, kind)
  }

  const legs = possible.map((mode) => {
    const kind = MODES[mode].kind
    const from = kind ? ends.from[kind] : { band: 'far', near: [] }
    const to = kind ? ends.to[kind] : { band: 'far', near: [] }
    const why = []

    let score = POINTS[from.band] + POINTS[to.band]
    for (const [which, end] of [['left', from], ['arrived', to]]) {
      if (!kind || end.km == null) continue
      const others = kinds.filter((k) => k !== kind).map((k) => ends[which === 'left' ? 'from' : 'to'][k]?.km)
      const nearest = others.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)[0]
      if (nearest != null && end.km * CLEARLY_NEARER < nearest) {
        score += 2
        why.push(
          `${which} ${Math.round(end.km * 1000)} m from ${end.near[0]?.name}, and ${Math.round(nearest * 1000)} m from the nearest ${kinds.find((k) => k !== kind)}`
        )
      }
    }

    if (from.band === 'at') why.push(`the trace is inside ${from.node.name}${from.part ? `, ${from.part.name}` : ''} when it stops`)
    if (to.band === 'at') why.push(`the trace resumes inside ${to.node.name}${to.part ? `, ${to.part.name}` : ''}`)
    if (from.band === 'near' && from.near.length > 1)
      why.push(`no fix at a ${kind}; ${from.near.length} serve where the trace stops`)
    if (to.band === 'near' && to.near.length > 1)
      why.push(`no fix at a ${kind}; ${to.near.length} serve where the trace resumes`)
    if (mode === 'road') why.push('nothing rules a long drive out')

    return {
      mode,
      from,
      to,
      left: crossing.from.at,
      arrived: crossing.to.at,
      km: crossing.km,
      kmh: crossing.kmh,
      score,
      certainty: certaintyOf(from.band, to.band),
      why,
    }
  })

  legs.sort((a, b) => b.score - a.score || (a.mode === 'road') - (b.mode === 'road'))

  // A mode nothing supports is noise on a card. Road survives with no
  // support because it is the honest remainder, but only when it is alone.
  const kept = legs.filter((l) => l.score > 0)
  const ranked = kept.length ? kept : legs.filter((l) => l.mode === 'road')

  return { crossing, legs: ranked, ask: askFor(ranked[0], crossing) }
}

/**
 * Deduction alone never gets past `likely`.
 *
 * Both ends landing inside a node is the best this evidence can do, and it
 * is still a photograph — the person could have been meeting somebody off a
 * train. `confirmed` is reserved for a timetable that answered or a person
 * who said so, and handing it out here would put inference on the same rung
 * as testimony, which is the one thing the story pipeline is built not to do.
 */
export function certaintyOf(from, to) {
  if (from === 'at' && to === 'at') return 'likely'
  if (from === 'at' || to === 'at') return (from === 'far' || to === 'far') ? 'possible' : 'likely'
  if (from === 'near' && to === 'near') return 'possible'
  if (from === 'near' || to === 'near') return 'possible'
  return 'unknown'
}

/**
 * The two ends of this are not equally useful, and pretending otherwise is
 * the fastest way to get a hopper route wrong.
 *
 * Somebody who likes a lounge is at the airport three hours early and may
 * sit there while the two flights before theirs push back. So "last seen at
 * Heathrow at 12:40" bounds the departure from below and does nothing else:
 * on Heathrow–Edinburgh that leaves four candidates, and any rule that
 * quietly picks the first of them will be wrong most of the time.
 *
 * Nobody lingers in an arrivals hall. The first fix after landing is
 * therefore tight, and it is the end that narrows. Working backwards from
 * it — minus the time to clear the airport and get to where the photograph
 * was taken — gives a real bound on the arrival, and the arrival plus a
 * block time gives a real bound on the departure.
 *
 * So: the origin rejects, the destination decides.
 */
export const HABITS = {
  /** Getting out of a terminal and onto the road. Longer where a border is
   *  crossed, but the difference is inside the slack, so one number. */
  clearing_minutes: 30,
  /** Airport to city, at airport-road speeds. Rome to Fiumicino is
   *  twenty-four kilometres and about forty minutes, which this gives. */
  ground_kmh: 45,
  /** How long somebody might plausibly dawdle before the first photograph
   *  at the far end. Not a rejection — a ranking. */
  linger_minutes: 120,
}

/**
 * How much better the best candidate has to be before it gets named.
 *
 * An hour, because the bound it is measured against — `landed_by` — is built
 * out of a guessed clearing time and a guessed road speed, and is good to
 * about half an hour. Two services separated by less than that are separated
 * by nothing, and the honest output is both of them and a question.
 */
export const MARGIN_MINUTES = 60

/**
 * Slack on the rejection bound, as distinct from the ranking one.
 *
 * The tight `landed_by` is right for ranking and wrong for throwing things
 * away. QF163 into Wellington is scheduled to land at 23:55 and the
 * Timeline has them at the hotel at 00:05 — ten minutes, which is not
 * possible and is nonetheless what the data says, because a schedule is not
 * an arrival and Google's idea of when a visit began is its own. Rejecting
 * on the tight bound threw out the right flight.
 *
 * The departure end needs it for a better reason, and one that took real
 * data to see. A recorded stay at an airport does not end when the
 * aeroplane leaves — it ends when the *phone* leaves the airport's
 * footprint, and the phone is on the aeroplane. Wellington on 17 June has
 * them still inside the airport twenty-five minutes after QF282 pushed
 * back, which is not a contradiction, it is what boarding looks like. Both
 * of these flights were being thrown away for being real.
 *
 * So: **hard facts reject, soft fits rank**, and the facts get three
 * quarters of an hour of slack at both ends. Ranking keeps the tight
 * number, because a candidate an hour better is still an hour better.
 */
export const GRACE_MINUTES = 45

/** How long it takes to get from a node to a point `km` away, in ms. */
export function reachMs(km) {
  const hours = Math.max(0, Number(km) || 0) / HABITS.ground_kmh
  return (hours * 60 + HABITS.clearing_minutes) * 60000
}

/**
 * The question to put to a timetable.
 *
 * Both ends are lists, not answers, and that is deliberate: the point of
 * asking is to have the service settle which of Ciampino and Fiumicino it
 * was.
 */
export function askFor(leg, crossing) {
  if (!leg || !MODES[leg.mode]?.kind) return null
  const codes = (end) => (end.node ? [end.node.code] : end.near.map((n) => n.code))
  // How far the far end's fix is from the node it is being attributed to —
  // nought if they photographed the baggage hall, twenty-four kilometres if
  // the first picture is in the middle of Rome.
  const away = leg.to.node ? (leg.to.km ?? 0) : (leg.to.near[0]?.km ?? 0)
  const landedBy = new Date(ms(crossing.to.at) - reachMs(away)).toISOString()

  return {
    mode: leg.mode,
    from: codes(leg.from),
    to: codes(leg.to),
    from_part: leg.from.part?.name ?? null,
    // Weak, and known to be weak: they were in the lounge.
    left_after: crossing.from.at,
    // How that last sighting was come by, because it changes what it
    // proves. A recorded stay at an airport can outlast the aeroplane —
    // the phone is on it. A photograph cannot: somebody standing in a
    // terminal at 12:40 was not on the 12:10.
    left_how: crossing.from.how ?? null,
    // Strong: they were somewhere else by then, and it takes this long to
    // get there from the airport.
    landed_by: landedBy,
    // Soft, for ranking rather than rejecting.
    landed_after: new Date(ms(landedBy) - HABITS.linger_minutes * 60000).toISOString(),
  }
}

/**
 * Two Heathrow–Edinburgh flights an hour apart, down to one.
 *
 * Everything hard happens as a rejection: a service that had already left
 * before they were last seen at the airport, one that landed after they
 * were demonstrably in town, one from a terminal they were not standing in.
 * Those are facts about the world and they throw candidates away without
 * apology.
 *
 * What is left gets ranked by one rule, which is the whole of the
 * asymmetry above: **the flight that landed closest to when they were next
 * seen.** Being early at Heathrow says nothing; being seen in Edinburgh at
 * 18:20 says the flight that landed at 17:35 beats the one that landed at
 * 15:10, because the alternative is somebody who sat in an arrivals hall
 * for three hours.
 *
 * A winner is only named when it is `CLEARLY_NEARER` better than the
 * runner-up. Otherwise both come back and somebody gets asked — which on
 * this evidence is the correct outcome, not a failure.
 *
 * @param services  [{ number, operator, from, to, dep, arr, terminal_from }]
 * @param ask       what askFor() produced
 */
export function narrow(services = [], ask) {
  if (!ask) return { one: null, ranked: [], rejected: [] }
  const rejected = []
  const keep = []

  for (const s of services) {
    const no = (why) => rejected.push({ service: s, why })
    if (ask.from.length && s.from && !ask.from.includes(s.from)) { no(`leaves ${s.from}, not ${ask.from.join(' or ')}`); continue }
    if (ask.to.length && s.to && !ask.to.includes(s.to)) { no(`arrives ${s.to}, not ${ask.to.join(' or ')}`); continue }
    if (ask.from_part && s.terminal_from && !samePart(ask.from_part, s.terminal_from)) {
      no(`leaves from ${s.terminal_from}; the trace is in ${ask.from_part}`)
      continue
    }
    // A photograph pins them to the ground; a recorded stay only pins the
    // phone to the airport, and the phone boards the aeroplane.
    const slack = ask.left_how === 'photograph' ? 0 : GRACE_MINUTES * 60000
    if (s.dep && ms(s.dep) < ms(ask.left_after) - slack) {
      no(slack ? 'had long gone when they were last seen at the airport' : 'had gone before they were photographed at the airport')
      continue
    }
    if (s.arr && ms(s.arr) > ms(ask.landed_by) + GRACE_MINUTES * 60000) {
      no('lands well after they were already somewhere else')
      continue
    }
    keep.push({ service: s, waited: s.arr ? ms(ask.landed_by) - ms(s.arr) : Infinity })
  }

  keep.sort((a, b) => a.waited - b.waited)
  const [best, next] = keep
  // An absolute margin rather than a ratio, because the thing being compared
  // is a distance from a bound that is itself fuzzy — `landed_by` is built
  // out of a guessed clearing time and a guessed road speed, and is good to
  // about half an hour. Five minutes better than thirty-five is inside that
  // slop and means nothing; two and a half hours better is a different
  // flight.
  const clear = best && (!next || next.waited - best.waited >= MARGIN_MINUTES * 60000)

  return {
    one: clear ? best.service : null,
    ranked: keep.map((k) => ({ ...k.service, waited_minutes: Math.round(k.waited / 60000) })),
    rejected,
  }
}

/** "5", "Terminal 5" and "T5" are the same terminal. */
export function samePart(a, b) {
  const bare = (s) => String(s ?? '').toUpperCase().replace(/TERMINAL|^T(?=\d)|[\s.]/g, '').trim()
  return bare(a) === bare(b)
}

/**
 * The whole thing: a trace in, deduced legs out.
 *
 * `began_moving` marks a crossing that is already at speed on the first
 * fix of the trace — somebody photographing out of the window before they
 * photographed anything on the ground. Its departure end is not in the
 * evidence at all, and the reader has to be told that rather than shown the
 * nearest airport to wherever the aeroplane happened to be.
 */
export function legsFor(trace, opts = {}) {
  const fixes = Array.isArray(trace) ? trace : fixesFrom(trace)
  const crossings = crossingsIn(fixes, opts)
  return crossings.map((c) => {
    const airborne = fixes.length > 0 && c.from.at === fixes[0].at
    const out = deduce(c, opts)
    if (c.kmh > IMPOSSIBLE_KMH) {
      out.trace_contradicts_itself = true
      for (const leg of out.legs) {
        leg.certainty = 'unknown'
        leg.why.unshift(
          `${c.kmh} km/h over ${c.km} km, which nothing flies — one of these two times is wrong, not the journey`
        )
      }
    }
    if (airborne) {
      out.began_moving = true
      for (const leg of out.legs) {
        if (leg.from.band === 'at') continue
        leg.why.unshift('the trace is already moving faster than a car on its first fix, so where this began is not in it')
        leg.certainty = leg.to.band === 'at' ? 'possible' : 'unknown'
      }
    }
    return out
  })
}

export { ON_FOOT_KMH }
