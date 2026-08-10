// Real "things to do" suggestions for the Explore tab, via Foursquare's
// Places API — chosen over Google Places for now since it needs no GCP
// console/billing setup, just an API key. Runs server-side so
// FOURSQUARE_API_KEY is never exposed to the client, same rule as every
// other secret in this app.
const KEY = process.env.FOURSQUARE_API_KEY
const API_VERSION = '2025-06-17'

/**
 * What to ask Foursquare, in order of how much of the original it keeps.
 *
 * Emoji first, because a flag in the string fails every time and removing
 * it costs nothing. Then the first of several places, since a trip called
 * "Lisbon & Porto" is two answers and Foursquare wants one.
 */
export function nearAttempts(raw) {
  const cleaned = String(raw || '')
    // Anything outside letters, numbers, spaces and the punctuation that
    // appears in real place names. Flags are pairs of regional indicators
    // and would otherwise survive a naive emoji strip.
    .replace(/[^\p{L}\p{N}\s,.'&()-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

  const first = cleaned.split(/\s*(?:&|,| and )\s*/i)[0]?.trim()
  const out = []
  for (const candidate of [String(raw || '').trim(), cleaned, first]) {
    if (candidate && !out.includes(candidate)) out.push(candidate)
  }
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' })
    return
  }
  if (!KEY) {
    res.status(500).json({ error: 'FOURSQUARE_API_KEY is not configured' })
    return
  }

  const near = req.query?.near
  if (!near || !near.trim()) {
    res.status(400).json({ error: 'near required' })
    return
  }
  const query = req.query?.query

  try {
    // The caller sends a trip title, because that is what the screen above
    // it is called. Foursquare wants a place. "Lisbon & Porto 🇵🇹" is not
    // one: it answered 400, "Boundaries could not be determined", and the
    // app said "couldn't reach Foursquare" — which was neither true nor
    // any help.
    //
    // So try what was asked, then progressively less of it. A trip named
    // after two cities can still answer for the first; a flag emoji can
    // never answer for anything.
    let data = null
    let last = null
    for (const attempt of nearAttempts(near)) {
      const params = new URLSearchParams({ near: attempt, limit: '12', sort: 'POPULARITY' })
      if (query && query.trim()) params.set('query', query.trim())

      const r = await fetch(`https://places-api.foursquare.com/places/search?${params}`, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${KEY}`,
          'X-Places-Api-Version': API_VERSION,
        },
      })
      if (r.ok) {
        data = await r.json()
        break
      }
      last = `Foursquare ${r.status}: ${await r.text()}`
      // Only a place we cannot resolve is worth another go. A bad key or a
      // rate limit will say the same thing three times.
      if (r.status !== 400) break
    }
    if (!data) {
      // Logged as well as returned. This came back as a bare 502 with the
      // reason only ever visible to the person who happened to be looking
      // at the screen.
      console.error('explore-search', last)
      res.status(502).json({ error: last || 'Foursquare could not place that.' })
      return
    }
    const places = (data.results || []).map((p) => ({
      id: p.fsq_place_id,
      name: p.name || 'Untitled',
      type: p.categories?.[0]?.name || null,
      address: p.location?.formatted_address || null,
      distance: typeof p.distance === 'number' ? p.distance : null,
      website: p.website || null,
    }))
    res.status(200).json({ places })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
