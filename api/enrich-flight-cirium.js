import { REACH } from '../src/lib/flightEnrich.js'

// Cirium, for the flights nothing else can reach.
//
// AeroDataBox stops at 365 days on every tier it sells, which covers 113 of
// 482 flights here. The other 369 go back to October 2009, and Cirium's
// historical service is the only one that plausibly reaches them.
//
// Same shape as api/enrich-flight.js on purpose: same `fields` out, same
// `found` / `beyond` distinction, same `?peek=1`. Nothing downstream knows
// or cares which source answered — enrichment() and the backfill are written
// against the shape, not the vendor.
//
// CIRIUM_API_KEY and CIRIUM_APP_ID in Vercel. Both go on every request as
// query parameters, which is how the Flex APIs are authenticated; the app id
// is the half that identifies you and the key is the half that must not be
// committed, so neither is in this file.
//
// ── This mapping has NOT been confirmed against a real answer ──────────────
//
// Written from the documented shape and from memory of it, because this
// environment cannot reach api.flightstats.com to check. That is exactly how
// the Aviation Edge assessment nearly went wrong, so the same rule applies:
//
//   `?peek=1` returns what the source actually said, untouched, writes
//   nothing, and — because there are two plausible paths for a historical
//   lookup — tries both and reports which one answered.
//
// Run the peek on one old flight before letting this near 369 of them. Delete
// neither the peek nor this paragraph until it has been.

/** Where the Flex APIs live. */
const BASE = 'https://api.flightstats.com/flex'

/**
 * Two ways to ask "what was this flight on this date", and they are not
 * interchangeable.
 *
 * The ordinary flight-status service covers a window around today. The
 * historical service is the one that goes back years, and it is a different
 * path and a different version — which is the single most likely thing to be
 * wrong in this file, hence the peek trying both.
 *
 * Historical first, because 369 of the 371 flights still waiting are more
 * than a year old and asking the recent service about 2014 is a wasted
 * request.
 */
export function paths({ carrier, number, on }) {
  const [y, m, d] = String(on).split('-').map((n) => Number(n))
  const tail = `${carrier}/${number}/dep/${y}/${m}/${d}`
  return [
    { name: 'historical', url: `${BASE}/flightstatus/historical/rest/v1/json/flight/${tail}` },
    { name: 'status', url: `${BASE}/flightstatus/rest/v2/json/flight/status/${tail}` },
  ]
}

/**
 * Everywhere a historical lookup might live, for the peek only.
 *
 * The first peek settled two things and left one open. The credentials are
 * right — the status service answered with a structured Flex error naming
 * the date, which it could not have done otherwise. And the status service
 * on this account reaches back seven days:
 *
 *   "The date specified is not within the expected range.
 *    Earliest allowed date '2026-08-04'"
 *
 * Seven days is useless for an archive that starts in 2009, so everything
 * depends on the historical service, and that answered 404. A 404 is two
 * different things wearing one number: a URL that does not exist, or a
 * product this account is not subscribed to. Guessing between them from one
 * probe is how the Aviation Edge assessment nearly went wrong.
 *
 * So the peek tries every shape the service is known to have taken, and the
 * pattern of answers tells them apart. If they all 404 identically it is
 * the subscription, and no amount of URL-guessing will help. If one answers
 * differently, that is the path, and it goes into paths() above.
 *
 * Deliberately peek-only: the real lookup must stay at one or two requests
 * per flight, not six, or a backfill of 369 flights becomes 2,214.
 */
export function candidates({ carrier, number, on }) {
  const [y, m, d] = String(on).split('-').map((n) => Number(n))
  const pad = (n) => String(n).padStart(2, '0')
  const tail = `${carrier}/${number}/dep/${y}/${m}/${d}`
  const padded = `${carrier}/${number}/dep/${y}/${pad(m)}/${pad(d)}`
  return [
    { name: 'historical v1', url: `${BASE}/flightstatus/historical/rest/v1/json/flight/${tail}` },
    { name: 'historical v2', url: `${BASE}/flightstatus/historical/rest/v2/json/flight/${tail}` },
    { name: 'historical v3', url: `${BASE}/flightstatus/historical/rest/v3/json/flight/${tail}` },
    // Some Flex products keep history under the ordinary status tree with a
    // version of its own rather than a separate one.
    { name: 'status v3', url: `${BASE}/flightstatus/rest/v3/json/flight/status/${tail}` },
    // And zero-padded dates, in case the 404 is nothing more interesting
    // than that.
    { name: 'historical v1, padded', url: `${BASE}/flightstatus/historical/rest/v1/json/flight/${padded}` },
    { name: 'status v2', url: `${BASE}/flightstatus/rest/v2/json/flight/status/${tail}` },
  ]
}

/**
 * "CX139" into a carrier and a number.
 *
 * Cirium wants them apart; this app stores them together, because that is how
 * they appear on a boarding pass. The awkward cases are the carriers with a
 * digit in them — 9W, 3K, U2, B6 — which is why this cannot simply take the
 * leading letters.
 *
 * Two characters wins whenever the third is a digit, which is right for every
 * IATA code. A three-letter code with no digits is an ICAO designator and is
 * passed through as one; Cirium accepts both, and says which it got back.
 */
export function splitNumber(said = '') {
  const clean = String(said).toUpperCase().replace(/[\s-]/g, '')
  const two = clean.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/)
  // Every carrier code has a letter in it. Without this "12345" splits into
  // carrier "12", which is not a refusal — it is a confident wrong answer,
  // and it would be sent to a paid API 369 times.
  if (two && /[A-Z]/.test(two[1])) return { carrier: two[1], number: two[2] }
  const three = clean.match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/)
  if (three) return { carrier: three[1], number: three[2] }
  return null
}

const put = (out, key, value) => {
  if (value != null && value !== '') out[key] = value
}

/**
 * One flightStatus, in this app's column names.
 *
 * The field worth the money is `flightEquipment.tailNumber` — the registration,
 * which is the thing Aviation Edge's history does not carry and the thing
 * anybody who keeps a flight log actually wants.
 *
 * `operationalTimes` offers the same choice AeroDataBox does: the gate and the
 * runway. Runway is the aeroplane moving and gate is the door closing, and the
 * one that happened beats the one that was planned — so actual before
 * estimated, and gate before runway only when there is no runway time, because
 * "what time did I leave" is a question about the stand.
 */
export function mapAnswer(found = {}, appendix = {}) {
  const t = found.operationalTimes ?? {}
  const res = found.airportResources ?? {}
  const kit = found.flightEquipment ?? {}
  const out = {}

  put(out, 'registration', kit.tailNumber)
  // The type as flown, falling back to the type that was rostered.
  const code = kit.actualEquipmentIataCode || kit.scheduledEquipmentIataCode
  put(out, 'aircraft_model', nameOfEquipment(code, appendix) || code)

  put(out, 'actual_dep_time', when(t.actualGateDeparture ?? t.actualRunwayDeparture))
  put(out, 'actual_arr_time', when(t.actualGateArrival ?? t.actualRunwayArrival))

  put(out, 'gate_dep', res.departureGate)
  put(out, 'gate_arr', res.arrivalGate)
  put(out, 'terminal_dep', res.departureTerminal)
  put(out, 'terminal_arr', res.arrivalTerminal)

  put(out, 'airline', nameOfAirline(found.carrierFsCode, appendix))
  return out
}

/** The appendix carries the names; the flight carries only codes. */
function nameOfAirline(code, appendix = {}) {
  if (!code) return null
  const found = (appendix.airlines ?? []).find((a) => a?.fs === code || a?.iata === code)
  return found?.name ?? null
}

function nameOfEquipment(code, appendix = {}) {
  if (!code) return null
  const found = (appendix.equipments ?? []).find((e) => e?.iata === code)
  return found?.name ?? null
}

/** Cirium gives every time twice, local and UTC. UTC is the one that means
 *  the same thing in both airports. */
function when(pair) {
  const said = pair?.dateUtc ?? pair?.dateLocal ?? null
  if (!said) return null
  const at = new Date(said)
  return Number.isNaN(at.valueOf()) ? null : at.toISOString()
}

/** Which of several answers is the flight somebody actually took. */
export function pickLeg(list = [], { dep_airport: from } = {}) {
  if (!Array.isArray(list) || !list.length) return null
  const want = String(from ?? '').toUpperCase()
  if (!want) return list[0]
  return list.find((l) => String(l?.departureAirportFsCode ?? '').toUpperCase() === want) ?? list[0]
}

/**
 * Did it refuse to look, rather than look and find nothing?
 *
 * The distinction that cost 185 flights with the last source. Cirium answers
 * an unauthorised or out-of-subscription request with a 403, and a date
 * outside the entitlement with an error rather than an empty list — none of
 * which is evidence that a flight did not happen.
 */
export function beyondReach(status, said = '') {
  if (status === 401 || status === 403) return true
  if (status !== 400 && status !== 422) return false
  return /range|earlier|older|historical|not.*entitled|subscription/i.test(String(said))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  const key = process.env.CIRIUM_API_KEY
  const app = process.env.CIRIUM_APP_ID
  if (!key || !app) {
    res.status(500).json({
      error: `not configured — ${!key ? 'CIRIUM_API_KEY' : 'CIRIUM_APP_ID'} is missing`,
    })
    return
  }
  if (!(req.headers.authorization || '').startsWith('Bearer ')) {
    res.status(401).json({ error: 'sign in first' })
    return
  }

  const { number: said, on, from } = req.body || {}
  if (!said || !on) {
    res.status(400).json({ error: 'number and on (YYYY-MM-DD) required' })
    return
  }
  const split = splitNumber(said)
  if (!split) {
    // Not a shape any flight service can look up. Not a failure of the
    // source, and not something to retry.
    res.status(200).json({ found: false, why: `"${said}" is not a flight number this can split` })
    return
  }

  const credentials = `appId=${encodeURIComponent(app)}&appKey=${encodeURIComponent(key)}`
  const tries = paths({ ...split, on })

  try {
    // Both paths, reported side by side, so which one to keep is a fact
    // rather than a recollection. Writes nothing.
    if (req.query?.peek) {
      const seen = []
      // Every shape, not only the two the real lookup uses — see candidates().
      for (const t of candidates({ ...split, on })) {
        const r = await fetch(`${t.url}?${credentials}`)
        const body = await r.text()
        seen.push({ path: t.name, status: r.status, said: body.slice(0, 400) })
      }
      res.status(200).json({ peek: true, asked: `${split.carrier} ${split.number} on ${on}`, seen })
      return
    }

    let last = { status: 0, said: '' }
    for (const t of tries) {
      const r = await fetch(`${t.url}?${credentials}`)
      const body = await r.text()
      if (!r.ok) {
        last = { status: r.status, said: body }
        continue
      }
      const parsed = JSON.parse(body || '{}')
      const leg = pickLeg(parsed.flightStatuses ?? [], { dep_airport: from })
      // An empty list from a service that answered is a real "no record" for
      // that service — but only worth believing from the historical one, so
      // a miss here falls through to the next path rather than settling it.
      if (leg) {
        res.status(200).json({ found: true, via: t.name, fields: mapAnswer(leg, parsed.appendix ?? {}) })
        return
      }
      last = { status: r.status, said: '' }
    }

    res.status(200).json({
      found: false,
      beyond: beyondReach(last.status, last.said),
      status: last.status,
      said: String(last.said).slice(0, 300),
    })
  } catch (e) {
    console.error(`enrich-flight-cirium: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}

/** Exported so the backfill can be told how far this source sees. Left null
 *  deliberately: the historical entitlement is not something to guess at, and
 *  a wrong number here would silently skip the 2009 flights. Everything is
 *  asked, and a refusal is now safe — it records nothing. */
export const REACH_DAYS = REACH.cirium ?? null
