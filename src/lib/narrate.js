// A day, told as a day.
//
// The first version of this said "121 photographs between 09:14 and 21:40.
// 4 places stopped at for more than 12 minutes." Every word of it was true
// and it was worthless: a description of the database rather than of Rome.
// Somebody piecing together a trip from two years ago does not want to know
// how many rows there are. They want to know that they started at the
// Trevi Fountain, spent the middle of the day at the Pantheon, and were at
// the Colosseum until the light went.
//
// So: named places, in the order they happened, with the times attached to
// them rather than to a count. Still assembled from what the camera
// recorded and nothing else — no adjectives about the day, no claims about
// how it felt — but arranged the way a person would say it.
//
// Where nothing could be named, it says where it can and stops. A gap in a
// story is honest; a sentence padded with statistics to cover the gap is
// how the first version went wrong.

import { clockIn, hourIn } from './localTime.js'

const HOUR = 60

// Every time in here is local to the trip, never to whoever is reading.
// Told from Melbourne, a Roman day that ran 07:06 to 21:14 came out as
// "the evening, from 17:09" and ended "around 3:10" — eleven hours out,
// apparently running backwards, and calling an afternoon at Heathrow "the
// small hours". A travel log read on the other side of the world is the
// normal case, not the exotic one.
const clock = (t, zone) => clockIn(t, zone)

/** "just after nine", "the middle of the afternoon" — how people say when. */
export function partOfDay(t, zone) {
  const h = hourIn(t, zone)
  if (h == null) return 'sometime'
  if (h < 5) return 'the small hours'
  if (h < 9) return 'early'
  if (h < 12) return 'the morning'
  if (h < 14) return 'the middle of the day'
  if (h < 17) return 'the afternoon'
  if (h < 20) return 'the evening'
  return 'the night'
}

/** "40 minutes", "2 hours", "an hour and a half". */
export function howLong(minutes) {
  if (!Number.isFinite(minutes) || minutes < 1) return null
  if (minutes < HOUR) return `${Math.round(minutes)} minutes`
  const hours = minutes / HOUR
  if (Math.abs(hours - 1) < 0.15) return 'an hour'
  if (Math.abs(hours - 1.5) < 0.15) return 'an hour and a half'
  return `${hours < 3 ? hours.toFixed(1).replace('.0', '') : Math.round(hours)} hours`
}

const list = (items) =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * The day in prose.
 *
 * @param day     from photoDays.daysFrom()
 * @param names   stop index → the place it was, where one is known
 */
export function tellDay(day, names = {}, zone = null) {
  const stops = (day?.stops ?? []).map((s, i) => ({ ...s, name: names[i] || null }))
  if (!stops.length) return ''

  const told = stops.filter((s) => s.name)

  // Nothing could be named. Say the shape of the day rather than inventing
  // a landmark, and say it as a day: when it started, when it ended, how
  // much moving about there was.
  if (!told.length) {
    const places = stops.length
    return `Out from ${clock(day.from, zone)} to ${clock(day.to, zone)}, moving between ${places === 1 ? 'one spot' : `${places} spots`}. Nowhere along the way is on the map — the photographs put you here, but nothing here has a name.`
  }

  const sentences = []
  const first = told[0]
  const longest = [...told].sort((a, b) => b.minutes - a.minutes)[0]

  sentences.push(`${cap(partOfDay(first.from, zone))} at ${first.name}, from ${clock(first.from, zone)}.`)

  const middle = told.slice(1).filter((s) => s !== longest)
  if (middle.length) sentences.push(`Then ${list(middle.map((s) => s.name))}.`)

  if (longest !== first) {
    const span = howLong(longest.minutes)
    sentences.push(
      span
        ? `The longest stop was ${longest.name} — ${span} from ${clock(longest.from, zone)}.`
        : `Also ${longest.name}.`
    )
  } else if (howLong(first.minutes)) {
    sentences.push(`${cap(howLong(first.minutes))} there.`)
  }

  const last = told[told.length - 1]
  if (last !== first && last !== longest) sentences.push(`Last was ${last.name}, around ${clock(last.to, zone)}.`)

  const unnamed = stops.length - told.length
  if (unnamed) sentences.push(`${unnamed === 1 ? 'One other stop' : `${unnamed} other stops`} along the way, nowhere named.`)

  return sentences.join(' ')
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** The title of the day: where it was, not what number it is. */
export function titleDay(day, names = {}) {
  const named = (day?.stops ?? []).map((_, i) => names[i]).filter(Boolean)
  if (!named.length) return `Day ${day?.day_number ?? ''}`.trim()
  if (named.length === 1) return named[0]

  // The two that carry the day, in the order they happened, rather than a
  // list of six that reads as a receipt.
  const byLength = [...(day.stops ?? [])]
    .map((s, i) => ({ i, minutes: s.minutes, name: names[i] }))
    .filter((s) => s.name)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 2)
    .sort((a, b) => a.i - b.i)
  return byLength.map((s) => s.name).join(' and ')
}

export const RECONSTRUCTED =
  'Pieced together from where the photographs were taken and when — not written at the time.'
