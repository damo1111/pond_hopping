// A trip, laid out around today.
//
// The app has both halves of a day and has never put them on one axis.
// ItineraryView renders the future — planned_events, flights, the nights
// booked. dayShape.segment() renders the past — where the photographs say
// you stopped, and for how long. They live in different screens, and neither
// knows what day it is.
//
// Which is fine for a trip that is over and fine for one that has not
// started, and wrong for the only state this app is really for: the one
// where you are on the trip. Then the two halves are the same list. Behind
// you is what happened. Ahead of you is what is booked. Today is the single
// day that is both, and it is the day somebody actually opened the app to
// see.
//
// So: one lane, anchored on today.
//
//   BEHIND   collapsed, one row a day. You lived it; you only want it when
//            you go looking.
//   TODAY    open. What is booked, what has been done, where you have been
//            so far — filling in as the afternoon happens.
//   AHEAD    open, for a week. Flights, check-ins, the things with times.
//   REST     counted, not drawn, so the scroll has an end.
//
// Pure, because the interesting cases are the ones that are awkward to
// stand in: the last day of a trip, the first, a trip that runs a hundred
// days, a trip whose end date nobody ever filled in.

/**
 * How far ahead is worth drawing in full.
 *
 * Six days, so the lane always covers "the rest of this week" whatever day
 * it is. Further out is a plan rather than a schedule — nobody packs on
 * Monday for the Sunday after next — and drawing forty days of a long trip
 * turns the one screen you check at breakfast into a scroll.
 */
export const AHEAD_DAYS = 6

const DAY = 86400000
const asDay = (d) => (d ? String(d).slice(0, 10) : null)
const parse = (d) => (d ? Date.parse(`${asDay(d)}T00:00:00Z`) : NaN)
const dayAfter = (ms, n) => new Date(ms + n * DAY).toISOString().slice(0, 10)

/**
 * Every date the trip covers.
 *
 * An open-ended trip is one day long here rather than infinite. A trip
 * somebody started and never closed is the ordinary state of a trip you are
 * on — the end date is the thing you fill in when you get home — so this
 * must not treat it as broken, and must not invent an end either.
 */
export function datesOf(trip, { today = null } = {}) {
  const from = parse(trip?.start_date)
  if (!Number.isFinite(from)) return []
  // Runs to the end date, or to today when there is not one: a trip you are
  // on has days behind you whether or not anybody has said when it stops.
  const toRaw = trip?.end_date ?? (today && parse(today) >= from ? today : trip?.start_date)
  const to = parse(toRaw)
  if (!Number.isFinite(to) || to < from) return [asDay(trip.start_date)]
  const out = []
  for (let ms = from; ms <= to; ms += DAY) out.push(dayAfter(ms, 0))
  return out
}

/**
 * Today, on the reader's calendar rather than the server's.
 *
 * A trip runs on the traveller's clock. Read in UTC, the lane would turn
 * over at seven in the morning in Bangkok and tell somebody that tomorrow
 * had started while they were at breakfast — on the one screen whose entire
 * organising idea is which day it is.
 *
 * Separate from laidOut, which takes `today` as an argument and never reads
 * a clock, because every case worth testing is a day nobody is standing on.
 */
export function todayHere(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

/** 'behind' | 'today' | 'ahead' — where a date sits relative to now. */
export function whenIs(date, today) {
  const a = parse(date)
  const b = parse(today)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'ahead'
  if (a < b) return 'behind'
  if (a > b) return 'ahead'
  return 'today'
}

/** Rows keyed by the date they belong to. */
function byDay(rows, key) {
  const out = new Map()
  for (const r of rows ?? []) {
    const d = asDay(typeof key === 'function' ? key(r) : r?.[key])
    if (!d) continue
    if (!out.has(d)) out.set(d, [])
    out.get(d).push(r)
  }
  return out
}

/**
 * A stay covers its nights, not only its check-in.
 *
 * A hotel is one row with an event_date and an end_date, so keyed by date it
 * appears on the day you arrive and vanishes for the three nights you are
 * actually in it. On a lane whose whole job is "where am I tonight", that is
 * the wrong way round.
 *
 * The row is not duplicated — the same object is listed under each night,
 * marked with which night it is, so a card can say "night 2 of 4" and the
 * check-in detail can stay on the day it happens.
 */
export function nightsOf(events = []) {
  const out = new Map()
  for (const e of events) {
    if (e?.kind !== 'hotel') continue
    const from = parse(e.event_date)
    const to = parse(e.end_date)
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue
    const nights = Math.round((to - from) / DAY)
    for (let i = 1; i <= nights; i += 1) {
      const d = dayAfter(from, i)
      if (!out.has(d)) out.set(d, [])
      out.get(d).push({ stay: e, night: i + 1, of: nights + 1 })
    }
  }
  return out
}

/**
 * The trip as a lane around today.
 *
 * @param today   'YYYY-MM-DD'. Injected rather than read, because every
 *                interesting case here is a date somebody is not standing on.
 * @param events  planned_events rows
 * @param photos  photo rows, already filtered to this trip
 * @param ahead   how many days forward to draw in full
 *
 * @returns {{
 *   phase: 'live'|'upcoming'|'past',
 *   behind: Day[], today: Day|null, ahead: Day[], rest: number, total: number
 * }}
 *   where Day is { date, index, when, events, photos, stay }
 */
export function laidOut({ trip, today, events = [], photos = [], ahead = AHEAD_DAYS } = {}) {
  const dates = datesOf(trip, { today })
  const empty = { phase: 'upcoming', behind: [], today: null, ahead: [], rest: 0, total: 0 }
  if (!dates.length) return empty

  const eventsBy = byDay(events, 'event_date')
  const photosBy = byDay(photos, (p) => p.taken_on ?? p.taken_at)
  const nights = nightsOf(events)

  const days = dates.map((date, index) => ({
    date,
    // The number somebody would say out loud — "day four" — which is
    // one-based, and is the only place in this file that is.
    index: index + 1,
    when: whenIs(date, today),
    events: (eventsBy.get(date) ?? []).slice().sort(byTime),
    photos: (photosBy.get(date) ?? []).slice().sort(byTaken),
    // Which night of which stay, when this day is inside one rather than
    // the day it began.
    stay: nights.get(date) ?? [],
  }))

  const behind = days.filter((d) => d.when === 'behind')
  const now = days.find((d) => d.when === 'today') ?? null
  const rest = days.filter((d) => d.when === 'ahead')

  return {
    // Said from the dates rather than a status column, the same way
    // tripPhase does it, so the two can never disagree about a trip.
    phase: now ? 'live' : behind.length === days.length ? 'past' : 'upcoming',
    behind,
    today: now,
    ahead: rest.slice(0, ahead),
    // Counted rather than drawn. A number with nothing behind it is a worse
    // lie than a scroll, so whoever renders this must be able to open them.
    rest: Math.max(0, rest.length - ahead),
    total: days.length,
  }
}

/** Times are strings like '09:30'; a day's untimed things go last, because
 *  "at some point today" is not the start of the morning. */
function byTime(a, b) {
  const at = a?.start_time || null
  const bt = b?.start_time || null
  if (at && bt) return at.localeCompare(bt)
  if (at) return -1
  if (bt) return 1
  return (a?.sort_order ?? 0) - (b?.sort_order ?? 0)
}

function byTaken(a, b) {
  return String(a?.taken_at ?? '').localeCompare(String(b?.taken_at ?? ''))
}

/**
 * What a day behind you gets to say in one line.
 *
 * Places first, because that is what somebody scanning for a day is looking
 * for — "the day we went to Ayutthaya" — and a count of photographs is not
 * a memory. The count comes after, and only when there is one.
 *
 * Deliberately not a sentence. This is a row in a collapsed list, read at a
 * glance while scrolling past, and prose there is slower to read than a
 * list of names.
 */
export function saidBriefly(day) {
  if (!day) return ''
  const places = []
  for (const e of day.events) {
    if (e.kind === 'flight') continue
    const name = e.city || e.title
    if (name && !places.includes(name)) places.push(name)
  }
  for (const p of day.photos) {
    if (p.city && !places.includes(p.city)) places.push(p.city)
  }
  const flights = day.events.filter((e) => e.kind === 'flight').length
  const bits = []
  if (places.length) bits.push(places.slice(0, 3).join(' · '))
  if (flights) bits.push(flights === 1 ? 'a flight' : `${flights} flights`)
  // The count is a fallback, not an addition.
  //
  // Rendered, "Bangkok · a flight · 10 photographs" did not fit beside the
  // thumbnails and truncated to "Bangkok · a…" — so the row lost the fact
  // that there was a flight in order to say a thing the thumbnails were
  // already saying, in pictures, right next to it. Words for what happened;
  // the strip for how many.
  //
  // Kept when there is nothing else, because a day of forty photographs and
  // no named place should not read "Nothing recorded".
  if (!bits.length && day.photos.length) {
    bits.push(day.photos.length === 1 ? '1 photograph' : `${day.photos.length} photographs`)
  }
  // A day with nothing on it is a real day — a travel day, a day nobody took
  // a picture — and saying so is better than an empty row that reads as a
  // bug.
  return bits.length ? bits.join(' · ') : 'Nothing recorded'
}

/**
 * What is left of today.
 *
 * The one number today's card can say that no other day's can. Counted from
 * `done` rather than from the clock: something at 15:30 that has been ticked
 * is finished at two, and something at 09:00 that never happened is still
 * outstanding at six. The tick is the truth; the time is a plan.
 */
export function stillToCome(day) {
  if (!day) return 0
  return day.events.filter((e) => !e.done).length
}
