// When the weather is worth a sentence, and what the sentence is.
//
// David: "recall that i said when buildin the sotry feed in weather and
// news. There was a typhoon on my last day." — and then, plainly, "yes to do
// weather properly."
//
// Properly means two things, and the second is the harder one.
//
// ── 1. Knowing what happened ──────────────────────────────────────────────
//
// day_weather kept a WMO code and two temperatures. That scale puts a rumble
// of thunder and the edge of a hurricane in the same bucket — 95 to 99 — so
// the stored data could not tell that last day in Japan from an ordinary wet
// afternoon. Wind separates them and rain separates a shower from a day
// nobody went outside; both were in the archive response all along and were
// simply never asked for. They are now.
//
// ── 2. Knowing when to shut up ────────────────────────────────────────────
//
// A story that mentions the weather every day is a weather report, and
// nobody reads their own holiday as a weather report. Most days are simply
// weather and belong in the symbol beside the entry, where they already are.
//
// So a day earns a sentence only by being unlike the trip it is part of: a
// named-force wind, rain somebody had to change plans around, snow, or a
// temperature a long way from what the rest of the trip was doing. Ten mild
// days in Lisbon produce ten symbols and no sentences, which is correct.

/** Beaufort 8. The first wind with a name people use. */
export const GALE_KMH = 62
/** Beaufort 10. */
export const STORM_KMH = 89
/** Beaufort 12 — hurricane force, whatever the local word for it is. */
export const VIOLENT_KMH = 118

/** A day's rain somebody planned around. */
export const SOAKED_MM = 25
/** And one nobody went out in. */
export const DELUGE_MM = 60

/** How far from the trip's own average counts as a different kind of day. */
export const ODD_DEGREES = 8

const num = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * What a violent storm is called where it happened.
 *
 * The same wind is a typhoon in Okinawa, a hurricane in Florida and a
 * cyclone in Queensland, and using the wrong one is the kind of mistake that
 * tells a reader the app does not know where they were. It does know: every
 * day carries the coordinate its weather was asked about.
 */
export function stormWord(lat, lon) {
  const la = num(lat)
  const lo = num(lon)
  if (la == null || lo == null) return 'storm'
  // North-west Pacific — Japan, the Philippines, the South China Sea.
  if (la > 0 && lo >= 100 && lo <= 180) return 'typhoon'
  // North Atlantic and north-east Pacific.
  if (la > 0 && lo >= -180 && lo <= -30) return 'hurricane'
  // Everywhere else that gets them: the Indian Ocean and the South Pacific.
  return 'cyclone'
}

/**
 * How far out of the ordinary a day was, 0 to 3.
 *
 * 0 nothing to say · 1 worth a clause · 2 worth a sentence · 3 the day
 * somebody still talks about.
 */
export function severity(day, trip = []) {
  if (!day) return 0
  const wind = num(day.wind_kmh)
  const rain = num(day.rain_mm)
  const code = num(day.code)
  const high = num(day.high_c)

  if (wind != null && wind >= VIOLENT_KMH) return 3
  if (rain != null && rain >= DELUGE_MM) return 3
  if (wind != null && wind >= STORM_KMH) return 2
  if (rain != null && rain >= SOAKED_MM) return 2
  // Snow, and snow showers. Rare enough on most trips to be the thing that
  // happened, and the code scale is reliable about it in a way it is not
  // about storms.
  if (code != null && ((code >= 71 && code <= 77) || (code >= 85 && code <= 86))) return 2
  if (wind != null && wind >= GALE_KMH) return 1

  // A day a long way from what the rest of the trip was doing. Measured
  // against the trip rather than against a number, because eighteen degrees
  // is a cold day in Bangkok and a good one in Reykjavík.
  const avg = average(trip)
  if (high != null && avg != null && Math.abs(high - avg) >= ODD_DEGREES) return 1

  return 0
}

/** The trip's own baseline: the mean of its daily highs. */
export function average(trip = []) {
  const highs = trip.map((d) => num(d?.high_c)).filter((n) => n != null)
  if (!highs.length) return null
  return highs.reduce((a, b) => a + b, 0) / highs.length
}

/** Worth interrupting the story for. */
export function worthSaying(day, trip = []) {
  return severity(day, trip) >= 2
}

/**
 * The sentence, or null.
 *
 * Deliberately short and deliberately hedged at the top end. The archive
 * gives the wind over one point; the centre of the storm may have been a
 * hundred miles away, and "a typhoon hit you" is a claim this does not have.
 * "The edge of a typhoon" is what the number actually supports, and it is
 * still the most interesting sentence in the day.
 */
export function weatherLine(day, trip = []) {
  if (!worthSaying(day, trip)) return null
  const wind = num(day.wind_kmh)
  const rain = num(day.rain_mm)
  const code = num(day.code)
  const high = num(day.high_c)

  if (wind != null && wind >= VIOLENT_KMH) {
    return `The edge of a ${stormWord(day.lat, day.lon)} — ${Math.round(wind)} km/h of wind.`
  }
  if (rain != null && rain >= DELUGE_MM) {
    return `${Math.round(rain)}mm of rain. An indoor day whether or not you wanted one.`
  }
  if (wind != null && wind >= STORM_KMH) {
    return `A storm — ${Math.round(wind)} km/h of wind.`
  }
  if (code != null && ((code >= 71 && code <= 77) || (code >= 85 && code <= 86))) {
    return 'Snow.'
  }
  if (rain != null && rain >= SOAKED_MM) {
    return `${Math.round(rain)}mm of rain.`
  }

  const avg = average(trip)
  if (high != null && avg != null && Math.abs(high - avg) >= ODD_DEGREES) {
    const warmer = high > avg
    return `${Math.round(high)}°C — ${Math.round(Math.abs(high - avg))} degrees ${
      warmer ? 'warmer' : 'colder'
    } than the rest of the trip.`
  }
  return null
}

/**
 * The one day of a trip whose weather is part of the story.
 *
 * One, not all of them: a trip with three windy days does not need three
 * sentences about wind, and the worst of them is the one anybody remembers.
 * Ties go to the later day, on the same reasoning the trip offer uses — what
 * happened most recently is what is still being talked about.
 */
export function theDay(trip = []) {
  let best = null
  for (const day of trip) {
    const s = severity(day, trip)
    if (s < 2) continue
    if (!best || s > best.s || (s === best.s && String(day.on_date) >= String(best.day.on_date))) {
      best = { day, s }
    }
  }
  return best?.day ?? null
}
