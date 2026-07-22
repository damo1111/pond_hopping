import { useEffect, useState } from 'react'
import { API_BASE } from '../../lib/apiBase.js'

// The antidote to the bare edit form: fetch what Foursquare knows about
// this place and lead with it — a real photo, its rating, and a handful of
// genuinely-nearby things to do you can drop onto the same day in a tap.
// Fails quietly to nothing (renders null) so an unmatched place just falls
// back to the plain form beneath it.
function stars(rating10) {
  if (rating10 == null) return null
  const five = rating10 / 2
  const full = Math.floor(five)
  const half = five - full >= 0.5
  return '★'.repeat(full) + (half ? '½' : '')
}

export default function PlaceEnrichment({ name, city, onAddNearby }) {
  const [data, setData] = useState(undefined) // undefined loading, null none
  const [added, setAdded] = useState({})

  useEffect(() => {
    let alive = true
    const q = new URLSearchParams({ name })
    if (city) q.set('city', city)
    fetch(`${API_BASE}/api/place-enrich?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => alive && setData(d.place ? d : null))
      .catch(() => alive && setData(null))
    return () => {
      alive = false
    }
  }, [name, city])

  if (data === undefined) return <div className="pe-skel">looking this place up…</div>
  if (data === null) return null

  const { place, nearby } = data

  return (
    <div className="pe">
      {place.photo && (
        <div className="pe-hero">
          <img src={place.photo} alt="" loading="lazy" />
        </div>
      )}
      <div className="pe-meta">
        {place.rating != null && (
          <span className="pe-rating">
            <span className="pe-stars">{stars(place.rating)}</span>
            {place.rating.toFixed(1)}
          </span>
        )}
        {place.category && <span className="pe-chip">{place.category}</span>}
        {place.price && <span className="pe-chip">{'£'.repeat(place.price)}</span>}
      </div>
      {place.address && <div className="pe-addr">{place.address}</div>}
      {place.website && (
        <a className="pe-link" href={place.website} target="_blank" rel="noreferrer">
          visit website →
        </a>
      )}

      {nearby?.length > 0 && (
        <div className="pe-nearby">
          <div className="pe-nearby-title">Nearby</div>
          <div className="pe-nearby-row">
            {nearby.map((n) => (
              <div key={n.id} className="pe-near">
                <div className="pe-near-thumb">{n.photo ? <img src={n.photo} alt="" loading="lazy" /> : <span>📍</span>}</div>
                <div className="pe-near-name">{n.name}</div>
                {n.type && <div className="pe-near-type">{n.type}</div>}
                {onAddNearby && (
                  <button
                    className="pe-near-add"
                    disabled={added[n.id]}
                    onClick={() => {
                      setAdded((a) => ({ ...a, [n.id]: true }))
                      onAddNearby(n)
                    }}
                  >
                    {added[n.id] ? 'added ✓' : '+ add'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
