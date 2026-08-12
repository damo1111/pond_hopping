import { preflight } from './_lib/cors.js'
// What is at a set of coordinates.
//
// One call per stop, not per photograph. A three-day trip is perhaps twenty
// stops, so naming a whole trip costs twenty lookups against a free-tier
// Places key — as against three hundred image calls, which is what asking
// the photographs the same question would have cost.
//
// Returns candidates rather than an answer. Deciding which of them the stop
// actually was happens in src/lib/placePick.js, where the rules are visible
// and testable, and where the interesting case — several places at one
// point — is routed to the photographs instead of guessed at.
const KEY = process.env.FOURSQUARE_API_KEY
const API_VERSION = '2025-06-17'

/** Wide enough to catch the place you were standing in, tight enough that
 *  the list is neighbours rather than the whole district. */
export const RADIUS_M = 120

export const MAX_STOPS = 40

export default async function handler(req, res) {
  if (preflight(req, res)) return
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  if (!KEY) {
    res.status(500).json({ error: 'FOURSQUARE_API_KEY is not configured' })
    return
  }
  // The key is David's and the quota is his. Anonymous callers do not get
  // to spend it, even though nothing here reads his data.
  if (!(req.headers.authorization || '').startsWith('Bearer ')) {
    res.status(401).json({ error: 'sign in first' })
    return
  }

  const stops = Array.isArray(req.body?.stops) ? req.body.stops : []
  if (!stops.length) {
    res.status(400).json({ error: 'stops required' })
    return
  }
  if (stops.length > MAX_STOPS) {
    res.status(400).json({ error: `at most ${MAX_STOPS} stops at a time` })
    return
  }

  try {
    const found = await Promise.all(
      stops.map(async (s) => {
        const lat = Number(s?.lat)
        const lon = Number(s?.lon)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { key: s?.key, candidates: [] }

        const url =
          `https://places-api.foursquare.com/places/search` +
          `?ll=${lat},${lon}&radius=${RADIUS_M}&limit=10&sort=DISTANCE`

        try {
          const r = await fetch(url, {
            headers: {
              accept: 'application/json',
              authorization: `Bearer ${KEY}`,
              'X-Places-Api-Version': API_VERSION,
            },
          })
          if (!r.ok) {
            console.error(`name-places: ${lat},${lon}: ${r.status} ${await r.text()}`)
            return { key: s?.key, candidates: [] }
          }
          const body = await r.json()
          return {
            key: s?.key,
            candidates: (body?.results ?? []).map((p) => ({
              id: p.fsq_place_id ?? p.fsq_id,
              name: p.name,
              // Foursquare nests the readable category name; a stop with no
              // category is still a candidate, just one that cannot win a
              // tie on "somewhere you'd spend an afternoon".
              category: p.categories?.[0]?.name ?? '',
              metres: p.distance ?? null,
            })),
          }
        } catch (e) {
          // One coordinate that will not answer must not lose the day.
          console.error(`name-places: ${lat},${lon}: ${e.message}`)
          return { key: s?.key, candidates: [] }
        }
      })
    )

    res.status(200).json({ stops: found })
  } catch (e) {
    console.error(`name-places: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
