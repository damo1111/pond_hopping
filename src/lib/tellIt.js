// The day, said properly.
//
// Two versions of this have now been wrong in the same way: they described
// the photographs instead of the day. The first counted them. The second
// listed every place within a block of where they were taken — "La Cenatio
// Rotunda, then Nanní, Casa Museo Alberto Moravia, Palazzo delle
// Esposizioni, Piazza di Trevi, Antica Enoteca, Piazza del Parlamento and
// Piazza Della Pilotta" — while the runs table held the fact that the day
// began with a 21.4 km run through Rome at 4:50 pace.
//
// So this one starts from what is known and uses the photographs to fill
// the gaps, which is the opposite way round. Flights, runs and the places
// you actually stayed, in the order they happened. Everything else was
// walking, and walking is a gap between things, not a thing.

import { clockIn, hourIn } from './localTime.js'
import { words } from './sport.js'
import { onFootIn } from './walkFills.js'

const HOUR = 60

export function partOfDay(t, zone) {
  const h = hourIn(t, zone)
  if (h == null) return 'sometime'
  if (h < 5) return 'the small hours'
  if (h < 9) return 'first thing'
  if (h < 12) return 'the morning'
  if (h < 14) return 'the middle of the day'
  if (h < 17) return 'the afternoon'
  if (h < 20) return 'the evening'
  return 'late'
}

export function howLong(minutes) {
  if (!Number.isFinite(minutes) || minutes < 1) return null
  if (minutes < HOUR) return `${Math.round(minutes)} minutes`
  const hours = minutes / HOUR
  if (Math.abs(hours - 1) < 0.15) return 'an hour'
  if (Math.abs(hours - 1.5) < 0.15) return 'an hour and a half'
  return `${hours < 3 ? hours.toFixed(1).replace('.0', '') : Math.round(hours)} hours`
}

const list = (xs) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** A run, as a runner would say it. Distance first, because that is the
 *  fact; pace and climb after, because those are the texture.
 *
 *  Says "run" for a run and "walk" for a walk, from the row's own type.
 *  Calling a 21 km run "an activity" would make the app worse for the
 *  person who ran it in order to be vaguely correct for everybody. */
export function tellRun(run) {
  if (!run) return null
  const km = Number(run.distance_km)
  if (!Number.isFinite(km) || km <= 0) return null
  const kind = words(run.sport)
  const bits = []
  // Pace means something for a run and almost nothing for a stroll.
  if (run.pace && kind.one !== 'walk') bits.push(`${run.pace} pace`)
  if (Number(run.elevation_m) > 40) bits.push(`${Math.round(run.elevation_m)} m of climb`)
  return `A ${km.toFixed(1)} km ${kind.one}${bits.length ? ` — ${list(bits)}` : ''}.`
}

/** A flight, as the thing that made the day a travel day. */
export function tellFlight(f, zone) {
  if (!f?.dep_airport || !f?.arr_airport) return null
  const when = f.dep_time ? ` at ${clockIn(f.dep_time, zone)}` : ''
  return `${f.dep_airport} to ${f.arr_airport}${f.flight_number ? ` on ${f.flight_number}` : ''}${when}.`
}

/**
 * The whole day.
 *
 * @param day       { date, from, to, segments }
 * @param names     segment index → place name, where one is known
 * @param known     { runs, flights } from dayShape.knownOn
 * @param zone      the trip's timezone
 */
export function tellDay(day, names = {}, known = {}, zone = null) {
  const said = []

  for (const f of known.flights ?? []) {
    const line = tellFlight(f, zone)
    if (line) said.push(line)
  }

  for (const r of known.runs ?? []) {
    const line = tellRun(r)
    if (line) said.push(line)
  }

  const stayed = (day?.segments ?? [])
    .map((s, i) => ({ ...s, name: names[i] || null, i }))
    .filter((s) => s.stayed)

  const named = stayed.filter((s) => s.name)

  if (named.length) {
    const longest = [...named].sort((a, b) => b.minutes - a.minutes)[0]
    const first = named[0]

    said.push(
      first === longest
        ? `${cap(partOfDay(first.from, zone))} at ${first.name} — ${howLong(first.minutes) ?? 'a while'} from ${clockIn(first.from, zone)}.`
        : `${cap(partOfDay(first.from, zone))} at ${first.name}, from ${clockIn(first.from, zone)}.`
    )

    if (longest !== first)
      said.push(
        `The longest stop was ${longest.name} — ${howLong(longest.minutes) ?? 'a while'} from ${clockIn(longest.from, zone)}.`
      )

    // Everything else, named, without the running commentary. Three is the
    // most a sentence carries before it reads as a receipt.
    const rest = named.filter((s) => s !== first && s !== longest).slice(0, 3)
    if (rest.length) said.push(`Also ${list(rest.map((s) => s.name))}.`)
  }

  // A day of moving is still a day, and the twenty-minute rule erases it.
  //
  // Rome's first day has photographs over southern Scotland at 14:37,
  // Heathrow from 15:47, nothing at 18:04 because the plane was in the
  // air, and central Rome by 20:46. Not one of those lasted twenty
  // minutes, so every one was discarded as "passing through" and the day
  // said only that a flight happened. But on a travel day nobody lingers
  // anywhere — the moving IS the day, and when you finally got there is
  // the thing worth knowing.
  // What a walk's own track says about the holes between photographs. A
  // recorded route through a two-hour gap is not an inference at all.
  const foot = onFootIn(day, known.runs ?? [])
  if (foot.explained.length) {
    const g = foot.explained[0]
    said.push(
      `The ${howLong(g.minutes) ?? 'gap'} in between was spent walking${
        foot.km ? ` — ${foot.km} km on foot that day` : ''
      }.`
    )
  }

  const flights = known.flights ?? []
  if (flights.length) {
    // When you got there, which is the first photograph after the last
    // aeroplane landed — not the last photograph of the day. Those are an
    // hour apart and only one of them is the arrival.
    const landed = flights
      .map((f) => f.arr_time || f.dep_time)
      .filter(Boolean)
      .sort()
      .pop()
    const after = (day?.segments ?? []).filter((s) => s.from && (!landed || s.from >= landed))
    const arrival = after[0]
    if (arrival && !stayed.includes(arrival)) {
      const where = names[(day.segments ?? []).indexOf(arrival)]
      said.push(`${where ? `At ${where} by` : 'Out and about by'} ${clockIn(arrival.from, zone)}.`)
    }
  }

  // Places you stopped that nothing could name. Only worth saying when
  // something else was named — on its own it is the app apologising, and
  // "nowhere named" is not a fact about anybody's holiday.
  const unnamed = stayed.length - named.length
  if (unnamed > 0 && named.length)
    said.push(
      `${unnamed === 1 ? 'One more stop' : `${unnamed} more stops`} the map has no name for.`
    )

  if (!said.length && day?.from)
    return `Out from ${clockIn(day.from, zone)} to ${clockIn(day.to, zone)}. Nothing along the way is on the map.`

  return said.join(' ')
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** What the day was, in a few words. */
export function titleDay(day, names = {}, known = {}) {
  const flights = known.flights ?? []
  if (flights.length) {
    const last = flights[flights.length - 1]
    return `To ${last.arr_airport}`
  }

  const stayed = (day?.segments ?? []).map((s, i) => ({ ...s, name: names[i] })).filter((s) => s.stayed && s.name)
  if (stayed.length) {
    const top = [...stayed].sort((a, b) => b.minutes - a.minutes).slice(0, 2)
    if (top.length === 1) return top[0].name
    return top.sort((a, b) => new Date(a.from) - new Date(b.from)).map((s) => s.name).join(' and ')
  }

  const run = (known.runs ?? [])[0]
  if (run?.distance_km) return `${Number(run.distance_km).toFixed(1)} km`

  return `Day ${day?.day_number ?? ''}`.trim()
}

export const RECONSTRUCTED =
  'Pieced together from your flights, runs and where the photographs were taken — not written at the time.'
