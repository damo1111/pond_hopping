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
 * The voice.
 *
 * Pond Hopping's is dry rather than cute — "That didn't work", "Tip it in",
 * "this is the screen, not the data". So the duck is dry too. "8 km.
 * Waddled." lands; "Quack! You waddled 8km today! 🦆" is a different app and
 * a worse one, and it is the version everybody writes first.
 *
 * The line to hold: **the facts are untouched, only the framing is dressed.**
 * "53 buildings and 1 piece of art. A balanced diet." embellishes the
 * judgement and not one number. "Rome has opinions about cats" invents a
 * fact, and the night this says one of those is the night nobody believes
 * the counts either.
 *
 * Each angle carries several phrasings, and which one is used depends on how
 * recently that angle has been used — so the second time you get told about
 * your feet in a fortnight, it is not the same sentence about your feet.
 */
const nth = (list, n) => list[n % list.length]

/** A sentence starts with a capital, and `top.word` is "buildings". */
const Cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w)

/**
 * Every true thing about today, as a line, most surprising first.
 *
 * `weight` is roughly "how rarely does an evening look like this" — it
 * decides the order when nothing has been said recently, and it is the
 * reason a first visit beats a long walk beats a tally of buildings.
 */
export function anglesFor(facts, seen = 0) {
  if (!facts) return []
  const out = []
  const add = (shape, weight, says) => {
    const said = Array.isArray(says) ? nth(says.filter(Boolean), seen) : says
    if (said) out.push({ shape, weight, text: said })
  }

  const [top, second] = facts.ranked ?? []
  const rarest = [...(facts.ranked ?? [])].reverse().find((r) => r.n >= 1)
  const where = facts.first_time?.[0]

  add('first_time', 100, where && [
    `A new pond. ${where}, for the first time.`,
    `${where}. Never been. Now been.`,
    `First time on this pond: ${where}.`,
  ])

  if (facts.legs.length) {
    const l = facts.legs[0]
    const route = l.from && l.to ? `${l.from} to ${l.to}` : 'a flight'
    const after = facts.photographs ? ` ${plural(facts.photographs, 'photograph', 'photographs')} on the other side.` : ''
    add('flew', 90, [
      `${route}. That is the hop done.${after}`,
      `One hop, ${route}.${after}`,
      `${route}, and then you did not sit down.`,
    ])
  }

  for (const a of facts.activities ?? []) {
    add('activity', 80, a.km && [
      `${a.km} km ${a.kind ?? 'run'}. On holiday. Show-off.`,
      `${a.km} km, voluntarily, abroad.`,
    ])
  }

  // The long day. Only worth saying when it really was one.
  const hours = spanHours(facts.from, facts.to)
  add('long_day', 70, hours >= 12 && [
    `${facts.from} to ${facts.to}. Up with the ducks and down with them too.`,
    `${Math.round(hours)} hours between the first photograph and the last.`,
    `${facts.from}. You were up at ${facts.from}.`,
  ])

  add('feet', 55, facts.km_on_foot >= 8 && [
    `${facts.km_on_foot} km. Waddled.`,
    `${facts.km_on_foot} km, and not one of them sitting down.`,
    `${facts.km_on_foot} km on those little legs.`,
  ])

  // The juxtaposition. Only when the gap is genuinely comic.
  add('lopsided', 60, top && rarest && top.subject !== rarest.subject && top.n >= 10 * rarest.n && [
    `${plural(top.n, top.word, top.word)}. And ${plural(rarest.n, rarest.word, rarest.word)}. A balanced diet.`,
    `${plural(top.n, top.word, top.word)}, ${plural(rarest.n, rarest.word, rarest.word)}. No notes.`,
    `${plural(rarest.n, rarest.word, rarest.word)}. And ${plural(top.n, top.word, top.word)}. Priorities.`,
  ])

  // The obsession, stated flatly, which is the joke.
  add('fixation', 45, top && top.n >= 25 && [
    `${plural(top.n, top.word, top.word)} in one day. You have a type.`,
    `${top.n} ${top.word}. That is a lot of ${top.word}.`,
    `Somebody liked the ${top.word} today.`,
  ])

  add('runner_up', 35, second && second.n >= 5 && [
    `Mostly ${top.word}. Some ${second.word}. Classic.`,
    `${Cap(top.word)} and ${second.word}, in that order, all day.`,
  ])

  add('feet_modest', 30, facts.km_on_foot >= 2 && [
    `${facts.km_on_foot} km on your feet.`,
    `${facts.km_on_foot} km of pottering.`,
  ])

  add('tally', 20, facts.photographs >= 5 && [
    `${plural(facts.photographs, 'photograph', 'photographs')}. The pond is filling up.`,
    `${facts.photographs} kept.`,
    `${plural(facts.photographs, 'photograph', 'photographs')} today. Steady.`,
  ])

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
  // Built once to choose the shape, then rebuilt asking for the phrasing
  // that shape has not had yet. Told about your feet twice in a fortnight,
  // you get two different sentences about your feet.
  const angles = anglesFor(facts, 0)
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

  const usedBefore = recent.filter((s) => s === chosen.shape).length
  const dressed = anglesFor(facts, usedBefore).find((a) => a.shape === chosen.shape)
  return { shape: chosen.shape, text: (dressed ?? chosen).text }
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
