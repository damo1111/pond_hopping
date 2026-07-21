// Real "things to do" suggestions for the Explore tab, via Foursquare's
// Places API — chosen over Google Places for now since it needs no GCP
// console/billing setup, just an API key. Runs server-side so
// FOURSQUARE_API_KEY is never exposed to the client, same rule as every
// other secret in this app.
const KEY = process.env.FOURSQUARE_API_KEY
const API_VERSION = '2025-06-17'

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
    const params = new URLSearchParams({ near: near.trim(), limit: '12', sort: 'POPULARITY' })
    if (query && query.trim()) params.set('query', query.trim())

    const r = await fetch(`https://places-api.foursquare.com/places/search?${params}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${KEY}`,
        'X-Places-Api-Version': API_VERSION,
      },
    })
    if (!r.ok) {
      res.status(502).json({ error: `Foursquare ${r.status}: ${await r.text()}` })
      return
    }
    const data = await r.json()
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
