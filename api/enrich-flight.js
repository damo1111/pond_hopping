import { preflight } from './_lib/cors.js'
import { REACH } from '../src/lib/flightEnrich.js'

// What somebody else knows about a flight you were on.
//
// One flight, one lookup, once ever. Historical flight data does not change,
// so a flight that has been asked about is never asked again — which is what
// keeps any paid source at one query per flight rather than one per view.
//
// The rules for what may be written live in src/lib/flightEnrich.js and are
// deliberately not here: fill what is empty, keep what somebody recorded,
// and where the two disagree keep both. You were on the aeroplane and the
// API was not.
//
// AeroDataBox, through RapidAPI, because it has a free tier and returns the
// same shape of fields a paid source would — so the swap later is a mapping,
// not a rewrite. FLIGHT_API_KEY in Vercel.
//
// ── Reading a response before trusting it ─────────────────────────────────
//
// `?peek=1` returns whatever the source said, untouched, and writes nothing.
// The mapping below was written against the documented shape; the peek is
// how it gets checked against the real one before forty flights are filled
// in from a guess. Delete neither the peek nor this paragraph until the
// mapping has been confirmed against an actual answer.

const HOST = 'aerodatabox.p.rapidapi.com'

/** How far back this source can see. Kept in flightEnrich.js beside the
 *  other facts about sources, because the backfill needs it too. */
export const REACH_DAYS = REACH.aerodatabox

/**
 * Is this refusal about the date rather than the flight?
 *
 * The distinction is the whole of the bug this exists to prevent. "I have no
 * record of that flight" is an answer, and a flight that gets it is finished
 * with for ever, because historical data does not change. "That date is
 * outside my window" is not an answer at all — the source never looked — and
 * recording it as one retires the flight permanently from every future
 * source too.
 *
 * 185 flights were stamped "no record" by a source that had refused to open
 * its eyes. They would have been skipped by the next provider, silently, and
 * the only sign would have been a backfill that came back suspiciously fast.
 */
export function beyondReach(status, said = '') {
  if (status !== 400 && status !== 422) return false
  return /earlier than|not be earlier|out of range|older than|historical/i.test(String(said))
}

function ask(path) {
  return fetch(`https://${HOST}${path}`, {
    headers: {
      'X-RapidAPI-Key': process.env.FLIGHT_API_KEY,
      'X-RapidAPI-Host': HOST,
    },
  })
}

/**
 * One flight's worth of answer, in this app's column names.
 *
 * Everything is optional and everything may be absent: a source that knows
 * only the registration should fill only the registration, and one that
 * knows nothing at all must return an empty object rather than a row of
 * nulls — see enrichment(), which treats an empty answer as "not enriched"
 * so that a bad afternoon for an API does not mark every flight done.
 */
/**
 * "2026-07-07 03:07Z" into something Postgres will not have to guess at.
 *
 * A space where the T belongs and no seconds. Postgres would probably take
 * it; probably is not a word worth using about the timestamps a story is
 * going to be written from.
 */
export function instant(said) {
  if (!said) return null
  const m = String(said).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?Z?$/)
  return m ? `${m[1]}T${m[2]}${m[3] ?? ':00'}Z` : said
}

export function mapAnswer(found = {}) {
  const dep = found.departure ?? {}
  const arr = found.arrival ?? {}
  const out = {}

  const put = (key, value) => {
    if (value != null && value !== '') out[key] = value
  }

  put('registration', found.aircraft?.reg)
  put('airline', found.airline?.name)
  // Local and UTC are both offered; UTC is the one that means the same thing
  // everywhere, and every time in this database is stored as an instant.
  //
  // runwayTime is wheels up and wheels down — the aeroplane actually moving
  // — and revisedTime is the latest estimate for the stand. Prefer the one
  // that happened. On CX139 out of Hong Kong they are two hours apart:
  // scheduled 01:10, revised 01:10, off the runway at 03:07.
  put('actual_dep_time', instant(dep.runwayTime?.utc ?? dep.revisedTime?.utc))
  put('actual_arr_time', instant(arr.runwayTime?.utc ?? arr.revisedTime?.utc))
  put('aircraft_model', found.aircraft?.model)
  put('call_sign', found.callSign)
  put('gate_dep', dep.gate)
  put('gate_arr', arr.gate)
  put('terminal_dep', dep.terminal)
  put('terminal_arr', arr.terminal)
  put('distance_km', found.greatCircleDistance?.km)
  return out
}

/** Which of several answers is the flight somebody actually took. */
export function pickLeg(list = [], flight = {}) {
  const from = String(flight.dep_airport ?? '').toUpperCase()
  if (!Array.isArray(list) || !list.length) return null
  if (!from) return list[0]
  return (
    list.find((l) => String(l?.departure?.airport?.iata ?? '').toUpperCase() === from) ?? list[0]
  )
}

export default async function handler(req, res) {
  if (preflight(req, res)) return
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  if (!process.env.FLIGHT_API_KEY) {
    res.status(500).json({ error: 'FLIGHT_API_KEY is not configured' })
    return
  }
  if (!(req.headers.authorization || '').startsWith('Bearer ')) {
    res.status(401).json({ error: 'sign in first' })
    return
  }

  const { number, on, from } = req.body || {}
  if (!number || !on) {
    res.status(400).json({ error: 'number and on (YYYY-MM-DD) required' })
    return
  }

  try {
    const r = await ask(`/flights/number/${encodeURIComponent(number)}/${encodeURIComponent(on)}`)
    const said = await r.text()
    if (!r.ok) {
      // Two different things arrive here and only one of them is an answer.
      //
      // 204, or a 404: the source looked and has no record of that flight on
      // that date. Historical data does not change, so that is final.
      //
      // 400 "must not be earlier than 365 day(s) ago": the source did not
      // look. Treating that as "no record" is what stamped 185 flights as
      // finished with when nothing had been asked, and would have had the
      // next provider skip every one of them.
      res.status(200).json({
        found: false,
        beyond: beyondReach(r.status, said),
        status: r.status,
        said: said.slice(0, 300),
      })
      return
    }

    const list = JSON.parse(said || '[]')
    if (req.query?.peek) {
      res.status(200).json({ peek: true, count: Array.isArray(list) ? list.length : 0, raw: list })
      return
    }

    const leg = pickLeg(list, { dep_airport: from })
    res.status(200).json({ found: !!leg, fields: leg ? mapAnswer(leg) : {} })
  } catch (e) {
    console.error(`enrich-flight: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
