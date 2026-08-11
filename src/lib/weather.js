// What the weather was, on a day somebody was somewhere.
//
// Every trip in this app already carries the two things a historical weather
// lookup needs: a date, and a coordinate from the photographs taken that day.
// Nothing has to be asked for and nothing has to be remembered.
//
// Open-Meteo's archive is the source. It reaches back to 1940, needs no key,
// and answers in one request per day-and-place — see api/day-weather.js. Its
// free tier is for non-commercial use, which is a decision rather than a
// detail and is written up in docs/backlog.md.
//
// Deliberately small on screen: a symbol and a number. A travel journal that
// starts reporting humidity and wind direction has stopped being a journal.
// The weather earns its place because "cold and bright" is a thing people
// actually remember about a trip, and because it dates a photograph in a way
// nothing else does.

/** Which scale a number is shown in. `device` follows the browser's locale. */
export const UNITS = ['device', 'c', 'f']

/**
 * Celsius in, whichever they asked for out.
 *
 * Rounded to whole degrees. Nobody remembers a trip as 11.4°, and a decimal
 * point in a journal reads as a readout rather than a memory.
 */
export function asDegrees(celsius, unit = 'device', locale = null) {
  if (celsius == null || Number.isNaN(Number(celsius))) return null
  const scale = unit === 'device' ? deviceScale(locale) : unit
  const n = scale === 'f' ? Number(celsius) * 9 / 5 + 32 : Number(celsius)
  return { value: Math.round(n), scale, text: `${Math.round(n)}°${scale === 'f' ? 'F' : 'C'}` }
}

/**
 * Fahrenheit is used by almost nowhere and assumed by almost nothing, so the
 * test is for the handful of places that do rather than against a list of
 * the places that don't.
 */
export function deviceScale(locale = null) {
  const tag = String(
    locale ?? (globalThis.navigator?.language || globalThis.navigator?.languages?.[0] || 'en-GB')
  ).toLowerCase()
  const region = tag.split('-')[1] || ''
  return ['us', 'bs', 'ky', 'lr', 'pw', 'fm', 'mh'].includes(region) ? 'f' : 'c'
}

// WMO weather codes, as Open-Meteo returns them, collapsed to the handful of
// things somebody would actually say about a day. The full table has
// twenty-eight entries and distinguishes "slight" from "moderate" drizzle,
// which is not a distinction anybody makes about their own holiday.
const SKIES = [
  { upTo: 0, symbol: '☀️', said: 'clear' },
  { upTo: 2, symbol: '🌤️', said: 'mostly sunny' },
  { upTo: 3, symbol: '☁️', said: 'overcast' },
  { upTo: 48, symbol: '🌫️', said: 'fog' },
  { upTo: 57, symbol: '🌦️', said: 'drizzle' },
  { upTo: 67, symbol: '🌧️', said: 'rain' },
  { upTo: 77, symbol: '🌨️', said: 'snow' },
  { upTo: 82, symbol: '🌧️', said: 'showers' },
  { upTo: 86, symbol: '🌨️', said: 'snow showers' },
  { upTo: 99, symbol: '⛈️', said: 'thunderstorms' },
]

/** A code from the archive, as something to look at and something to read. */
export function sky(code) {
  // Number(null) is 0, and 0 is "clear sky" — so a day with no reading at
  // all reported a cloudless one. Anything that is not actually a number
  // has to be turned away before it is treated as one.
  if (code == null || code === '') return { symbol: null, said: null }
  const n = Number(code)
  if (!Number.isFinite(n)) return { symbol: null, said: null }
  const found = SKIES.find((s) => n <= s.upTo)
  return found ? { symbol: found.symbol, said: found.said } : { symbol: null, said: null }
}

/**
 * The trip in one temperature.
 *
 * The mean of each day's high, not the mean of everything recorded: "it was
 * about twelve degrees" is a statement about afternoons, which is when
 * anybody was outside in it.
 */
export function tripAverage(days = []) {
  // Same trap: Number(null) is 0, so a day with no reading would have been
  // averaged in as a freezing one and pulled the whole trip down.
  const highs = days
    .filter((d) => d?.high_c != null && d.high_c !== '')
    .map((d) => Number(d.high_c))
    .filter((n) => Number.isFinite(n))
  if (!highs.length) return null
  return Math.round((highs.reduce((a, b) => a + b, 0) / highs.length) * 10) / 10
}

/** The one symbol that describes a trip: whichever sky it had most of. */
export function tripSky(days = []) {
  const seen = new Map()
  for (const d of days) {
    const { symbol } = sky(d?.code)
    if (symbol) seen.set(symbol, (seen.get(symbol) ?? 0) + 1)
  }
  let best = null
  for (const [symbol, n] of seen) if (!best || n > best.n) best = { symbol, n }
  return best?.symbol ?? null
}
