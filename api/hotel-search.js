// Loyalty-aware hotel search for the Concierge. David has status with
// Accor, Hilton, Marriott and IHG (see traveler_preferences), so rather
// than a generic "hotels near X" dump, this fans out one Foursquare text
// search per flagship brand and tags each hit with its parent programme —
// points-earning options first, always.
const KEY = process.env.FOURSQUARE_API_KEY
const API_VERSION = '2025-06-17'

// Flagship + one mid-tier query per programme keeps it to 8 API calls,
// not one per sub-brand (Accor alone has ~40).
const BRAND_QUERIES = [
  { q: 'Sofitel', program: 'Accor' },
  { q: 'Novotel', program: 'Accor' },
  { q: 'Hilton', program: 'Hilton' },
  { q: 'DoubleTree', program: 'Hilton' },
  { q: 'Marriott', program: 'Marriott' },
  { q: 'Sheraton', program: 'Marriott' },
  { q: 'InterContinental', program: 'IHG' },
  { q: 'Holiday Inn', program: 'IHG' },
]

async function searchBrand(near, { q, program }) {
  const params = new URLSearchParams({ near, query: `${q} hotel`, limit: '3' })
  const r = await fetch(`https://places-api.foursquare.com/places/search?${params}`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${KEY}`,
      'X-Places-Api-Version': API_VERSION,
    },
  })
  if (!r.ok) return []
  const data = await r.json()
  // Text search also surfaces venues INSIDE hotels (gyms, bars, lounges,
  // restaurants) — a "Wellington Lounge at InterContinental" is not a
  // place to sleep. Keep only results that read as the hotel itself.
  const NOT_A_HOTEL = /\b(gym|bar|lounge|restaurant|spa|cafe|café|club|pool|terrace|kitchen)\b/i
  return (data.results || [])
    .filter((p) => (p.name || '').toLowerCase().includes(q.toLowerCase()) && !NOT_A_HOTEL.test(p.name || ''))
    .map((p) => ({
      id: p.fsq_place_id,
      name: p.name,
      program,
      address: p.location?.formatted_address || null,
      distance: typeof p.distance === 'number' ? p.distance : null,
      website: p.website || null,
    }))
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

  try {
    const batches = await Promise.all(BRAND_QUERIES.map((b) => searchBrand(near.trim(), b)))
    const seen = new Set()
    const hotels = []
    for (const batch of batches) {
      for (const h of batch) {
        if (seen.has(h.id)) continue
        seen.add(h.id)
        hotels.push(h)
      }
    }
    hotels.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))
    res.status(200).json({ hotels })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
