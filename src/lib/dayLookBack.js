// What today was, at the end of today.
//
// A trip's story is written once, afterwards, from everything. This is the
// other thing: one day, on the evening of that day, while it is still the
// day you are having.
//
// It exists for two reasons and the second is the one that pays for it.
//
// The first is that it is nice. "You walked six kilometres, took a flight,
// and photographed fifty-three buildings" is a good thing to be handed at
// nine in the evening with your shoes off.
//
// The second is that **nine in the evening is the only time anybody will
// answer a question.** The story pipeline asks its questions days or weeks
// later — "who were you with at the Trevi?" — by which point the honest
// answer is "I can't remember". Asked the same evening, the answer is real,
// and a real answer is testimony, which is the top rung of the evidence
// ladder. Every question answered tonight is a fact the reconstruction does
// not have to guess at later.
//
// ── What it may and may not say ───────────────────────────────────────
//
// Everything here is a count of *photographs*, never a count of things.
// Fifty-three photographs whose subject is architecture is a fact. "You saw
// fifty-three buildings" is not — it is one church from eleven angles, and
// claiming otherwise is exactly the kind of confident nonsense that makes
// somebody stop trusting the rest of it.
//
// So this file counts, and hands the counts plus the raw observations to
// something that can write. Same division as the story pipeline: the
// arithmetic is here where it can be checked, and the sentences are made
// somewhere that knows how to make sentences.

import { groundCovered } from './tripTrace.js'
import { zoneAt } from './legs.js'

/**
 * The taxonomy the seeing pass actually uses, with words for it.
 *
 * Fixed on purpose — these are the twelve values `seen.subject` can hold, so
 * a count against them is exhaustive and a new one would show up as
 * `other` rather than silently vanishing.
 *
 * The plural is what gets read out. "Architecture" is what the model calls
 * it and nobody says it, so the reader gets "buildings".
 */
export const SUBJECTS = {
  architecture: { one: 'building', many: 'buildings' },
  landscape: { one: 'view', many: 'views' },
  street: { one: 'street scene', many: 'street scenes' },
  food: { one: 'plate of food', many: 'plates of food' },
  drink: { one: 'drink', many: 'drinks' },
  people: { one: 'photograph of people', many: 'photographs of people' },
  animal: { one: 'animal', many: 'animals' },
  interior: { one: 'interior', many: 'interiors' },
  artwork: { one: 'piece of art', many: 'pieces of art' },
  transport: { one: 'train, plane or boat', many: 'trains, planes and boats' },
  document: { one: 'sign or menu', many: 'signs and menus' },
  other: { one: 'other thing', many: 'other things' },
}

/**
 * Below this there is nothing to say, and saying it anyway is how a daily
 * notification becomes a daily annoyance that gets switched off.
 *
 * A day with three photographs and no movement is a day at the hotel with a
 * book. It is a perfectly good day and it does not need a summary.
 */
export const ENOUGH = { photos: 5, km: 2 }

const iso = (t) => String(t ?? '')
const onDay = (t, date) => iso(t).slice(0, 10) === date

/**
 * The clock face, as it was read at the time.
 *
 * `photos.taken_at` is mostly the camera's local clock stamped as UTC — see
 * backlog 1e — so the stored value already *is* the local time, and reading
 * it in UTC gives back exactly what the phone showed. Converting it to a
 * zone would move it. Where a photograph really does carry a true instant
 * this is an hour or two out on the label and nothing else; it is never
 * arithmetic, only a caption.
 */
export function clockFace(at) {
  const s = iso(at)
  const m = s.match(/T(\d{2}:\d{2})/)
  return m ? m[1] : null
}

/**
 * Everything today was, as countable facts.
 *
 * @param date     'YYYY-MM-DD'
 * @param photos   rows with taken_at, taken_on, lat, lon, seen
 * @param extras   { flights, runs, stays, been } — `been` is the places
 *                 visited before today, for working out what is new
 */
export function lookBackAt(date, photos = [], extras = {}) {
  const { flights = [], runs = [], stays = [], been = [] } = extras
  const today = photos.filter((p) => p?.taken_on === date || onDay(p?.taken_at, date))
  const located = today.filter((p) => p.lat != null && p.lon != null)
  const times = today.map((p) => p.taken_at).filter(Boolean).sort()

  // Where the day *ended*, which is the only fix that matters here.
  //
  // The zone below decides what time the evening look-back arrives, and on
  // a travel day the honest answer is the far end: somebody who left
  // Melbourne and landed in Bangkok is having their evening in Bangkok.
  //
  // This used to read `located[0]`, which is not the first fix of the day —
  // it is whichever row the database happened to return first, and the
  // rows are not ordered. On the day of the flight out to Thailand it
  // picked Melbourne, so the notification was due at 21:00 AEST, which is
  // five in the afternoon where they actually were. The comment on
  // whenToSend() has said "the last fix of the day" the whole time; the
  // code never did it.
  const lastFix =
    [...located]
      .filter((p) => p.taken_at)
      .sort((a, b) => String(a.taken_at).localeCompare(String(b.taken_at)))
      .at(-1) ??
    // Nothing on the day carries a time. Order is then meaningless and any
    // fix is as good as another, which is still better than none.
    located[0] ??
    null

  const counts = {}
  const observations = []
  for (const p of today) {
    const subject = p.seen?.subject
    if (subject) counts[subject] = (counts[subject] ?? 0) + 1
    // The free text is what lets the writing be specific. Kept whole and
    // unsummarised, because "a broad avenue centred on a distant dome" is
    // the sentence and no count contains it.
    if (p.seen?.what) observations.push({ at: clockFace(p.taken_at), what: p.seen.what, notable: p.seen.notable || null })
  }

  const legsToday = flights.filter((f) => onDay(f?.dep_time, date))
  const runsToday = runs.filter((r) => r?.run_date === date)
  const staysToday = stays.filter((s) => onDay(s?.arrived_at, date) || onDay(s?.at, date))

  // Somewhere they had not been before today. Compared on the city rather
  // than the coordinate, because standing on a different corner of the same
  // square is not a new place.
  const wherever = [...new Set(located.map((p) => p.city).filter(Boolean))]
  const first_time = wherever.filter((c) => !been.includes(c))

  return {
    date,
    // The two ends of the day, as the phone showed them.
    from: clockFace(times[0]),
    to: clockFace(times[times.length - 1]),
    photographs: today.length,
    // A floor, never a total: straight lines between fixes with anything
    // faster than walking taken out. groundCovered() says so itself.
    km_on_foot: groundCovered(today),
    counts,
    // Ordered biggest first, so whoever writes this does not have to.
    ranked: Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([subject, n]) => ({ subject, n, word: n === 1 ? SUBJECTS[subject]?.one : SUBJECTS[subject]?.many })),
    legs: legsToday.map((f) => ({
      number: f.flight_number,
      from: f.dep_airport,
      to: f.arr_airport,
      mode: f.mode ?? 'air',
    })),
    activities: runsToday.map((r) => ({ kind: r.sport, km: Number(r.distance_km) || null })),
    places: wherever,
    first_time,
    stays: staysToday.length,
    weather: [...new Set(today.map((p) => p.seen?.weather).filter(Boolean))],
    observations,
    zone: lastFix ? zoneAt([lastFix.lat, lastFix.lon]) : null,
  }
}

/** Is there a day here worth telling somebody about? */
export function worthSending(facts) {
  if (!facts) return false
  if (facts.legs.length || facts.activities.length || facts.first_time.length) return true
  return facts.photographs >= ENOUGH.photos || facts.km_on_foot >= ENOUGH.km
}

/**
 * The one line that arrives on the lock screen.
 *
 * Deliberately made here rather than by a model: it has to be right, it has
 * to be short, and it must not cost a model call for every hopper every
 * evening. The prose inside the app can be written; this is a label.
 *
 * It leads with whatever was rarest, because that is what makes somebody
 * open it. A flight beats twelve kilometres beats fifty-three buildings —
 * and a place they have never been beats all of it.
 */
export function oneLine(facts) {
  if (!facts) return null
  const bits = []
  if (facts.first_time.length) bits.push(`${facts.first_time[0]}, for the first time`)
  if (facts.legs.length) {
    const l = facts.legs[0]
    bits.push(l.from && l.to ? `${l.from} to ${l.to}` : 'a flight')
  }
  if (facts.km_on_foot >= ENOUGH.km) bits.push(`${facts.km_on_foot} km on your feet`)
  const top = facts.ranked[0]
  if (top && top.n >= 3) bits.push(`${top.n} ${top.word}`)
  if (!bits.length) return null
  // Three at most. A notification is a doorway, not the room.
  return bits.slice(0, 3).join(' · ')
}

/**
 * When to send it, as an instant.
 *
 * Nine in the evening where they are, not where the server is. Late enough
 * that the day is done and early enough that they are awake — and on a
 * travel day "where they are" is the far end, which is why the zone comes
 * from the last fix of the day rather than from the trip.
 */
export const SEND_AT_HOUR = 21

export function whenToSend(date, zone) {
  if (!date) return null
  const offset = typeof zone === 'number' ? zone : offsetOf(zone, date)
  if (!Number.isFinite(offset)) return null
  const local = Date.parse(`${date}T${String(SEND_AT_HOUR).padStart(2, '0')}:00:00Z`)
  return new Date(local - offset * 3600000).toISOString()
}

/**
 * How long after nine it is still worth sending.
 *
 * The tick is hourly, so being up to an hour late is the normal case and
 * needs room. Being six hours late is a different thing: a summary of your
 * evening that arrives at three in the morning is not late, it is wrong,
 * and it wakes somebody up to tell them about yesterday. Past this the
 * evening is simply missed, which is the better failure.
 */
export const STILL_WORTH_IT_MS = 3 * 3600000

/**
 * Is this evening due, right now?
 *
 * Separated from whenToSend() because it is the decision with the clock in
 * it, and a decision about a clock is the one thing worth being able to
 * test at four in the morning in Auckland without waiting for it.
 *
 * @returns `{ due, at, why }` — `why` is 'early', 'late' or 'nowhere' when
 *          it is not, so a worker log says which rather than just "no".
 */
export function dueNow(date, zone, now = Date.now(), grace = STILL_WORTH_IT_MS) {
  const at = whenToSend(date, zone)
  // No zone at all: every photograph of the day was taken without a fix, so
  // there is no honest answer to "is it nine o'clock where they are".
  if (!at) return { due: false, why: 'nowhere', at: null }
  const t = Date.parse(at)
  if (!Number.isFinite(t)) return { due: false, why: 'nowhere', at: null }
  if (now < t) return { due: false, why: 'early', at }
  if (now - t > grace) return { due: false, why: 'late', at }
  return { due: true, why: null, at }
}

function offsetOf(zone, when) {
  try {
    const at = new Date(`${when}T12:00:00Z`)
    const there = new Date(at.toLocaleString('en-US', { timeZone: zone }))
    const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
    return Math.round((there - utc) / 3600000)
  } catch {
    return NaN
  }
}
