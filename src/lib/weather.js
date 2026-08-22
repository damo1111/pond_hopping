// What the weather was, on a day somebody was somewhere.
//
// Every trip in this app already carries the two things a historical weather
// lookup needs: a date, and a coordinate from the photographs taken that day.
// Nothing has to be asked for and nothing has to be remembered.
//
// Open-Meteo's archive is the source. It reaches back to 1940, needs no key,
// answers with CORS headers — so this can be asked from the browser and
// needs no function of ours in front of it — and takes a whole trip's worth
// of days in one request per place.
//
// Its free tier is for non-commercial use. That is a real decision and it is
// in docs/backlog.md; the underlying data is ERA5, which is Copernicus and
// open even commercially, so the paid tier is a convenience rather than a
// gate. Nothing about the shape of this changes if the source does.
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


const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive'

/**
 * Where each day of a trip was, from the photographs taken on it.
 *
 * One coordinate per day, and the first located photograph of the day is as
 * good as any: the weather over a city is the weather over all of it, and a
 * centroid of somewhere they walked across is no more true than a point on
 * it. Days with no located photograph are left out — there is nowhere to ask
 * about.
 */
export function placesByDay(photos = []) {
  const byDay = new Map()
  for (const p of [...photos].sort((a, b) => String(a.taken_at ?? '').localeCompare(String(b.taken_at ?? '')))) {
    const d = p?.taken_on || String(p?.taken_at ?? '').slice(0, 10)
    if (!d || p?.lat == null || p?.lon == null || byDay.has(d)) continue
    byDay.set(d, { on_date: d, lat: Math.round(p.lat * 10) / 10, lon: Math.round(p.lon * 10) / 10 })
  }
  return [...byDay.values()].sort((a, b) => a.on_date.localeCompare(b.on_date))
}

/**
 * Which days still need asking about.
 *
 * The weather on a past date does not change, so anything already cached is
 * done for ever. Only the gaps are worth a request.
 */
export function stillToAsk(wanted = [], cached = []) {
  // A row cached before wind and rain were asked for is only half an answer.
  // The weather on a past date still does not change — but what we recorded
  // of it has, so those days go back on the list once and then never again.
  const have = new Set(
    cached.filter((c) => c?.wind_kmh != null).map((c) => c.on_date)
  )
  return wanted.filter((d) => !have.has(d.on_date))
}

/**
 * Ask the archive for a run of days at one place.
 *
 * Grouped by coordinate so a four-day trip in one city is one request rather
 * than four. Returns rows ready to store; a day the archive has no answer
 * for is simply absent rather than stored as a null, so it can be asked
 * again if the archive fills in later.
 */
export async function askArchive(days = [], fetcher = globalThis.fetch) {
  if (!days.length) return []
  const byPlace = new Map()
  for (const d of days) {
    const key = `${d.lat},${d.lon}`
    if (!byPlace.has(key)) byPlace.set(key, [])
    byPlace.get(key).push(d)
  }

  const out = []
  for (const [key, group] of byPlace) {
    const [lat, lon] = key.split(',')
    const dates = group.map((g) => g.on_date).sort()
    const url =
      `${ARCHIVE}?latitude=${lat}&longitude=${lon}` +
      `&start_date=${dates[0]}&end_date=${dates[dates.length - 1]}` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code,` +
      `wind_speed_10m_max,precipitation_sum&timezone=UTC`

    let answer = null
    try {
      const r = await fetcher(url)
      if (!r?.ok) continue
      answer = await r.json()
    } catch {
      // A day without weather is a day without a symbol on it. Nothing here
      // is worth failing a screen over.
      continue
    }

    const wanted = new Set(dates)
    const time = answer?.daily?.time ?? []
    for (let i = 0; i < time.length; i++) {
      if (!wanted.has(time[i])) continue
      const high = answer.daily.temperature_2m_max?.[i]
      const low = answer.daily.temperature_2m_min?.[i]
      const code = answer.daily.weather_code?.[i]
      // The two that turn a symbol into a sentence. See weatherStory.js: the
      // code scale puts a rumble of thunder and the edge of a hurricane in
      // the same bucket, and wind is what tells them apart.
      const wind = answer.daily.wind_speed_10m_max?.[i]
      const rain = answer.daily.precipitation_sum?.[i]
      if (high == null && low == null && code == null) continue
      out.push({
        on_date: time[i],
        lat: Number(lat),
        lon: Number(lon),
        high_c: high ?? null,
        low_c: low ?? null,
        code: code ?? null,
        wind_kmh: wind ?? null,
        rain_mm: rain ?? null,
      })
    }
  }
  return out
}
