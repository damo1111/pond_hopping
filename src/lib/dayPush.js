// The line that arrives on the lock screen at nine.
//
// Split out from dayLookBack.js because it is a different job. That file
// counts and must be exactly right; this one chooses what to say and must
// not be boring. On a fourteen-day trip this fires fourteen times, and
// fourteen notifications reading "6 km on your feet · 53 buildings" is one
// notification and thirteen annoyances.
//
// ── Where the variety comes from ──────────────────────────────────────
//
// Not from a random phrase bank. Randomness gives you the same sentence
// twice in a row about a third of the time, which is the thing being
// avoided, and it makes the app unpredictable in a way nobody asked for.
//
// It comes from **angles**: several genuinely different things that are all
// true about the same day. A day is a flight, and a fourteen-hour stretch,
// and fifty-three buildings, and one lonely piece of art. Any of those is a
// fair description; which one leads is free choice, and choosing a different
// one each evening costs nothing and reads as a different app each time.
//
// Each angle offers a line only when it actually applies, so a day with no
// flight never gets the flight angle. What is left is ordered by how rare it
// is, then filtered against what was said the last few nights, then the best
// survivor wins. Same day in, same line out — this is not random, it is
// simply not repetitive.
//
// ── The rule about invention ──────────────────────────────────────────
//
// Quirk comes from structure and juxtaposition, never from made-up
// specifics. "Fifty-three buildings, and one piece of art" is funny because
// it is true. "Rome has opinions about cats" is funnier and is a thing this
// app does not know, and the moment it says one of those nobody believes
// the numbers either.

import { SUBJECTS } from './dayLookBack.js'

/** How many recent evenings to avoid repeating. Two weeks is the trip. */
export const REMEMBER = 6

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * Every true thing about today, as a line, most surprising first.
 *
 * `weight` is roughly "how rarely does an evening look like this" — it
 * decides the order when nothing has been said recently, and it is the
 * reason a first visit beats a long walk beats a tally of buildings.
 */
export function anglesFor(facts) {
  if (!facts) return []
  const out = []
  const add = (shape, weight, text) => text && out.push({ shape, weight, text })

  const [top, second] = facts.ranked ?? []
  const rarest = [...(facts.ranked ?? [])].reverse().find((r) => r.n >= 1)

  add('first_time', 100, facts.first_time.length ? `${facts.first_time[0]}, for the first time.` : null)

  if (facts.legs.length) {
    const l = facts.legs[0]
    const route = l.from && l.to ? `${l.from} to ${l.to}` : 'a flight'
    add('flew', 90, `${route}${facts.photographs ? `, and ${plural(facts.photographs, 'photograph', 'photographs')} after it` : ''}.`)
  }

  for (const a of facts.activities ?? []) {
    add('activity', 80, a.km ? `${a.km} km ${a.kind ?? 'run'}, on holiday. Steady.` : null)
  }

  // The long day. Only worth saying when it really was one.
  const hours = spanHours(facts.from, facts.to)
  add('long_day', 70, hours >= 12 ? `${facts.from} to ${facts.to}. ${Math.round(hours)} hours of it.` : null)

  add('feet', 55, facts.km_on_foot >= 8 ? `${facts.km_on_foot} km, and every one of them walked.` : null)

  // The juxtaposition. Only when the gap is genuinely comic.
  add(
    'lopsided',
    60,
    top && rarest && top.subject !== rarest.subject && top.n >= 10 * rarest.n
      ? `${plural(top.n, top.word, top.word)}. And ${plural(rarest.n, rarest.word, rarest.word)}.`
      : null
  )

  // The obsession, stated flatly, which is the joke.
  add('fixation', 45, top && top.n >= 25 ? `${plural(top.n, top.word, top.word)} in one day.` : null)

  add('runner_up', 35, second && second.n >= 5 ? `Mostly ${top.word} today. Some ${second.word}.` : null)

  add('feet_modest', 30, facts.km_on_foot >= 2 ? `${facts.km_on_foot} km on your feet.` : null)

  add('tally', 20, facts.photographs >= 5 ? `${plural(facts.photographs, 'photograph', 'photographs')} today.` : null)

  return out.sort((a, b) => b.weight - a.weight)
}

function spanHours(from, to) {
  const mins = (s) => {
    const m = String(s ?? '').match(/^(\d{2}):(\d{2})$/)
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const a = mins(from)
  const b = mins(to)
  return a == null || b == null ? 0 : (b - a) / 60
}

/**
 * Tonight's line, given what the last few nights said.
 *
 * @param facts   from lookBackAt()
 * @param recent  shapes used on the previous evenings, newest first
 */
export function pushLine(facts, { recent = [] } = {}) {
  const angles = anglesFor(facts)
  if (!angles.length) return null

  const lately = recent.slice(0, REMEMBER)
  // The best thing not said lately. If everything has been said lately —
  // a long trip of very similar days — fall back to the least recently
  // used, which is still better than repeating last night.
  const fresh = angles.find((a) => !lately.includes(a.shape))
  // `recent` is newest first, so a bigger index means longer ago and a shape
  // that is not in there at all is best of all. Sorting the other way — the
  // first version of this — reaches for whatever was said last night, which
  // is precisely the thing being avoided.
  const agoOf = (shape) => {
    const i = lately.indexOf(shape)
    return i === -1 ? Infinity : i
  }
  const chosen = fresh ?? [...angles].sort((a, b) => agoOf(b.shape) - agoOf(a.shape))[0]

  return { shape: chosen.shape, text: chosen.text }
}

/** For a run of days: each evening's line, avoiding what came before. */
export function linesAcross(days = []) {
  const said = []
  return days.map((facts) => {
    const line = pushLine(facts, { recent: said })
    if (line) said.unshift(line.shape)
    return line
  })
}

export { SUBJECTS }
