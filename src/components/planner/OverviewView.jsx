import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet'
import { supabase } from '../../lib/supabase.js'
import { greatCircle } from '../../lib/geo.js'
import { AIRPORT_COORDS } from '../../lib/airportCoords.js'
import { KIND_META } from '../../lib/planItems.js'
import { coverUrl } from '../../lib/imgTransform.js'
import PlanFlightCard from './PlanFlightCard.jsx'

function nights(a, b) {
  if (!a || !b) return null
  const d = (new Date(b) - new Date(a)) / 86400000
  return d > 0 ? Math.round(d) : null
}

export default function OverviewView({ trip, events, onEditEvent }) {
  const [cover, setCover] = useState(null)

  useEffect(() => {
    supabase
      .from('photo_cache')
      .select('urls')
      .eq('trip_id', trip.id)
      .maybeSingle()
      .then(({ data }) => setCover(data?.urls?.[0] || null))
  }, [trip.id])

  const flights = events.filter((e) => e.kind === 'flight')
  const counts = {}
  for (const e of events) counts[e.kind] = (counts[e.kind] || 0) + 1

  // Flight route segments we can actually place on the map.
  const segments = flights
    .map((f) => {
      const from = AIRPORT_COORDS[f.detail?.dep_airport]
      const to = AIRPORT_COORDS[f.detail?.arr_airport]
      return from && to ? { from, to } : null
    })
    .filter(Boolean)

  const pts = segments.flatMap((s) => [s.from, s.to])
  const center = pts.length
    ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]
    : [20, 0]

  const n = nights(trip.start_date, trip.end_date)

  return (
    <div className="ov-scroll">
      <div className="ov-hero">
        {cover && <img className="ov-hero-img" src={coverUrl(cover, { width: 900, height: 500 })} alt="" />}
        <div className="ov-hero-shade" />
        <div className="ov-hero-text">
          <div className="ov-hero-title">{trip.title}</div>
          <div className="ov-hero-sub">
            {trip.start_date
              ? new Date(trip.start_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              : 'dates tbc'}
            {trip.end_date ? ` – ${new Date(trip.end_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            {n ? ` · ${n} nights` : ''}
          </div>
        </div>
      </div>

      <div className="ov-stats">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="ov-stat">
            <span className="ov-stat-i" style={{ background: (KIND_META[k] || KIND_META.other).color }}>
              {(KIND_META[k] || KIND_META.other).icon}
            </span>
            <span className="ov-stat-n">{v}</span>
            <span className="ov-stat-l">{(KIND_META[k] || KIND_META.other).label}{v > 1 ? 's' : ''}</span>
          </div>
        ))}
        {events.length === 0 && <div className="ov-empty">Nothing planned yet — head to Itinerary or ask the AI planner.</div>}
      </div>

      {segments.length > 0 && (
        <div className="ov-map">
          <MapContainer center={center} zoom={2} zoomControl={false} attributionControl={false} scrollWheelZoom={false} style={{ height: '100%', width: '100%', background: '#EDE9DF' }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            {segments.map((s, i) => (
              <Polyline key={i} positions={greatCircle(s.from, s.to, 64)} pathOptions={{ color: KIND_META.flight.color, weight: 2, dashArray: '5 7' }} />
            ))}
            {pts.map((p, i) => (
              <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: KIND_META.flight.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }} />
            ))}
          </MapContainer>
        </div>
      )}

      {flights.length > 0 && (
        <div className="ov-section">
          <div className="ov-section-title">Flights</div>
          <div className="ov-flights">
            {flights.map((f) => (
              <PlanFlightCard key={f.id} event={f} onEdit={() => onEditEvent(f)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
