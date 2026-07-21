import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { thumb } from '../../lib/imgTransform.js'
import { destinationQuery } from '../../lib/planItems.js'
import { API_BASE } from '../../lib/apiBase.js'

// Explore = ideas to fold into the trip. Two honest sources without a paid
// places API: the user's own wishlist (quick to pull one onto this trip),
// filtered to items that actually relate to THIS trip's destination
// (previously showed every unconverted wishlist item on every trip —
// a Samoa idea has no business appearing under a UK trip), and the AI
// planner (tap to have it suggest things for the destination).
function isRelevant(item, trip, dest) {
  const destLower = dest.toLowerCase()
  const hay = `${item.title || ''} ${item.country || ''}`.toLowerCase()
  const tripTitle = (trip.title || '').toLowerCase()
  return hay.includes(destLower) || destLower.includes(item.title?.toLowerCase() || '\0') || tripTitle.includes(item.country?.toLowerCase() || '\0')
}

// A place card for a live Foursquare search result (as opposed to a
// wishlist item) — its photo is fetched lazily, one request per card,
// same pattern as the Planespotters aircraft-photo lookup on flight cards.
function PlaceCard({ place, onAdd }) {
  const [photo, setPhoto] = useState(undefined)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/explore-photo?id=${encodeURIComponent(place.id)}`)
      .then((r) => (r.ok ? r.json() : { url: null }))
      .then((d) => alive && setPhoto(d.url || null))
      .catch(() => alive && setPhoto(null))
    return () => {
      alive = false
    }
  }, [place.id])

  return (
    <div className="ex-card">
      {photo ? (
        <div className="ex-cover">
          <img src={photo} alt="" loading="lazy" />
        </div>
      ) : photo === undefined ? (
        <div className="ex-cover photo-skel" />
      ) : (
        <div className="ex-cover ex-cover-empty">📍</div>
      )}
      <div className="ex-card-body">
        <div className="ex-card-title">{place.name}</div>
        <div className="ex-card-sub">{place.type || place.address || 'Foursquare'}</div>
        <button
          className="ex-add"
          disabled={added}
          onClick={() => {
            setAdded(true)
            onAdd(place)
          }}
        >
          {added ? 'added ✓' : '+ add to trip'}
        </button>
      </div>
    </div>
  )
}

export default function ExploreView({ trip, onAddIdea, onAddPlace, onAskAI }) {
  const [wishlist, setWishlist] = useState([])
  const [places, setPlaces] = useState(undefined) // undefined = loading, null = errored
  const dest = destinationQuery(trip)

  useEffect(() => {
    supabase
      .from('wishlist_items')
      .select('*')
      .is('trip_id', null)
      .then(({ data }) => setWishlist(data ?? []))
  }, [])

  useEffect(() => {
    setPlaces(undefined)
    fetch(`${API_BASE}/api/explore-search?near=${encodeURIComponent(dest)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setPlaces(d.places || []))
      .catch(() => setPlaces(null))
  }, [dest])

  const relevant = wishlist.filter((w) => isRelevant(w, trip, dest))

  return (
    <div className="ex-scroll">
      <button className="ex-ai" onClick={() => onAskAI(`Suggest a handful of great things to do on this trip (${dest}) — mix of food, sights and something a bit special.`)}>
        <span className="ex-ai-i">✨</span>
        <span>
          <span className="ex-ai-title">Get ideas for {dest}</span>
          <span className="ex-ai-sub">Ask the planner — it knows your taste</span>
        </span>
      </button>

      <div className="ex-section-title">Popular near {dest}</div>
      {places === undefined ? (
        <div className="ov-empty">Finding places…</div>
      ) : places === null ? (
        <div className="ov-empty">Couldn't reach Foursquare just now — try again shortly.</div>
      ) : places.length === 0 ? (
        <div className="ov-empty">No Foursquare results for {dest} yet.</div>
      ) : (
        <div className="ex-grid" style={{ marginBottom: 20 }}>
          {places.map((p) => (
            <PlaceCard key={p.id} place={p} onAdd={onAddPlace} />
          ))}
        </div>
      )}

      <div className="ex-section-title">From your wishlist</div>
      {relevant.length === 0 ? (
        <div className="ov-empty">Nothing on your wishlist matches {dest} yet — the AI planner above can suggest some instead.</div>
      ) : (
        <div className="ex-grid">
          {relevant.map((w) => (
            <div key={w.id} className="ex-card">
              {w.image_url ? (
                <div className="ex-cover">
                  <img src={thumb(w.image_url, { width: 300, height: 180 })} alt="" loading="lazy" />
                </div>
              ) : (
                <div className="ex-cover ex-cover-empty">🌍</div>
              )}
              <div className="ex-card-body">
                <div className="ex-card-title">{w.title}</div>
                {w.country && <div className="ex-card-sub">{w.country}</div>}
                <button className="ex-add" onClick={() => onAddIdea(w)}>
                  + add to trip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
