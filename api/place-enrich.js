// Ambient enrichment: given a planned item's name + city, find it on
// Foursquare and hand back what makes a card feel alive — a photo, the
// rating, the category, a website — plus a few genuinely-nearby things to
// do. This is what turns a bare "Airbnb — The Snug, Holt" row into
// something informative from the first render, no manual fields to fill.
const KEY = process.env.FOURSQUARE_API_KEY
const API_VERSION = '2025-06-17'
const BASE = 'https://places-api.foursquare.com'

const FIELDS = 'fsq_place_id,name,location,categories,rating,price,website,tel,hours,latitude,longitude,photos'

async function fsq(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${KEY}`, 'X-Places-Api-Version': API_VERSION },
  })
  if (!r.ok) throw new Error(`foursquare ${r.status}: ${await r.text()}`)
  return r.json()
}

function photoUrl(p, size = '400x300') {
  if (!p?.prefix || !p?.suffix) return null
  return `${p.prefix}${size}${p.suffix}`
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
  const name = req.query?.name
  const city = req.query?.city
  if (!name) {
    res.status(400).json({ error: 'name required' })
    return
  }

  try {
    // Strip our own title decoration ("Airbnb — The Snug, Holt" → "The
    // Snug") so the match lands on the actual venue, not the platform.
    const cleaned = String(name).replace(/^(airbnb|hotel|stay)\s*[—:-]\s*/i, '').split(/[—,]/)[0].trim()
    const p = new URLSearchParams({ query: cleaned, limit: '1', fields: FIELDS })
    if (city) p.set('near', city)
    const found = await fsq(`/places/search?${p}`)
    const place = (found.results || [])[0]
    if (!place) {
      res.status(200).json({ place: null })
      return
    }

    const lat = place.latitude
    const lon = place.longitude
    let nearby = []
    if (lat && lon) {
      const np = new URLSearchParams({
        ll: `${lat},${lon}`,
        radius: '1500',
        limit: '6',
        sort: 'POPULARITY',
        fields: 'fsq_place_id,name,categories,distance,photos',
      })
      const near = await fsq(`/places/search?${np}`)
      nearby = (near.results || [])
        .filter((n) => n.fsq_place_id !== place.fsq_place_id)
        .slice(0, 5)
        .map((n) => ({
          id: n.fsq_place_id,
          name: n.name,
          type: n.categories?.[0]?.name || null,
          distance: typeof n.distance === 'number' ? n.distance : null,
          photo: photoUrl(n.photos?.[0], '120x120'),
        }))
    }

    res.status(200).json({
      place: {
        id: place.fsq_place_id,
        name: place.name,
        category: place.categories?.[0]?.name || null,
        rating: place.rating ?? null, // Foursquare 0–10
        price: place.price ?? null, // 1–4
        address: place.location?.formatted_address || null,
        website: place.website || null,
        tel: place.tel || null,
        photo: photoUrl(place.photos?.[0], '600x400'),
      },
      nearby,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
