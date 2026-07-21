// Lazily fetches one photo for a Foursquare place — kept as its own
// endpoint (rather than bundled into explore-search) so the search list
// renders fast and photos load per-card, same pattern as the Planespotters
// aircraft-photo lookup elsewhere in this app.
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

  const id = req.query?.id
  if (!id) {
    res.status(400).json({ error: 'id required' })
    return
  }

  try {
    const r = await fetch(`https://places-api.foursquare.com/places/${encodeURIComponent(id)}/photos?limit=1`, {
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
    const photos = await r.json()
    const photo = Array.isArray(photos) ? photos[0] : null
    if (!photo) {
      res.status(200).json({ url: null })
      return
    }
    res.status(200).json({ url: `${photo.prefix}300x200${photo.suffix}` })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
