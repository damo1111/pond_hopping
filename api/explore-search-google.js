// Parked, not wired to the frontend yet — David's setting up Google Cloud
// billing/console access himself. Foursquare (explore-search.js) is the
// live source for now; swap this back in later if Google ends up preferred.
//
// Real "things to do" suggestions for the Explore tab, via Google Places
// API (New) — billed through the same Google Cloud project as the
// Google for Startups credits, unlike a narrowly-scoped Gemini/AI key.
// Runs server-side so GOOGLE_PLACES_API_KEY is never exposed to the
// client, same rule as every other secret in this app.
const KEY = process.env.GOOGLE_PLACES_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' })
    return
  }
  if (!KEY) {
    res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY is not configured' })
    return
  }

  const query = req.query?.query
  if (!query || !query.trim()) {
    res.status(400).json({ error: 'query required' })
    return
  }

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.photos,places.editorialSummary,places.googleMapsUri,places.primaryTypeDisplayName',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 10 }),
    })
    if (!r.ok) {
      res.status(502).json({ error: `Places API ${r.status}: ${await r.text()}` })
      return
    }
    const data = await r.json()
    const places = (data.places || []).map((p) => ({
      id: p.id,
      name: p.displayName?.text || 'Untitled',
      type: p.primaryTypeDisplayName?.text || null,
      address: p.formattedAddress || null,
      rating: p.rating || null,
      ratingCount: p.userRatingCount || null,
      summary: p.editorialSummary?.text || null,
      photoName: p.photos?.[0]?.name || null,
      mapsUri: p.googleMapsUri || null,
    }))
    res.status(200).json({ places })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
