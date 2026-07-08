import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet'
import { supabase } from '../lib/supabase.js'

const INK = '#1A1611'
const GOLD = '#A8842C'
const GREEN = '#3E7D54'

function fmtDur(min) {
  if (min >= 60) return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
  return `${min}m`
}

// The day's real movements, from the Google Timeline trace:
// ink line = the day's path, gold dots = timed stops, green = runs.
export default function DayMap({ tripId, date }) {
  const [track, setTrack] = useState(undefined) // undefined loading, null none
  const [runs, setRuns] = useState([])

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('day_tracks').select('path,visits').eq('trip_id', tripId).eq('track_date', date).limit(1),
      supabase.from('runs').select('label,distance_km,pace,color,coords').eq('trip_id', tripId).eq('run_date', date),
    ]).then(([t, r]) => {
      if (!alive) return
      setTrack(t.data?.[0] ?? null)
      setRuns(r.data ?? [])
    })
    return () => {
      alive = false
    }
  }, [tripId, date])

  if (track === undefined) return <div className="daymap-loading">loading the day…</div>
  if (!track && !runs.length) return null

  const path = track?.path ?? []
  const visits = track?.visits ?? []
  const bounds = [
    ...path,
    ...visits.map((v) => [v.lat, v.lon]),
    ...runs.flatMap((r) => [r.coords[0], r.coords[r.coords.length - 1]]),
  ]
  if (!bounds.length) return null

  return (
    <div className="daymap">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [24, 24] }}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
        style={{ height: 230, width: '100%', background: '#EDE9DF' }}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" />

        {path.length > 1 && (
          <Polyline positions={path} pathOptions={{ color: INK, weight: 2, opacity: 0.55 }} />
        )}

        {runs.map((r, i) => (
          <Polyline key={i} positions={r.coords} pathOptions={{ color: r.color || GREEN, weight: 3, opacity: 0.9 }}>
            <Popup>
              <div className="world-pop">
                <div className="world-pop-route">🏃 {r.label}</div>
                <div className="world-pop-flight">
                  {r.distance_km} km{r.pace ? ` · ${r.pace}` : ''}
                </div>
              </div>
            </Popup>
          </Polyline>
        ))}

        {visits.map((v, i) => (
          <CircleMarker
            key={i}
            center={[v.lat, v.lon]}
            radius={6}
            pathOptions={{ color: '#FFFFFF', fillColor: GOLD, fillOpacity: 0.95, weight: 1.5 }}
          >
            <Popup>
              <div className="world-pop">
                <div className="world-pop-route">
                  {v.t} – {v.e}
                </div>
                <div className="world-pop-flight">stopped here · {fmtDur(v.min)}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {visits.length > 0 && (
        <div className="daymap-strip">
          {visits.map((v, i) => (
            <span key={i} className="daymap-stop">
              <span className="daymap-stop-t">{v.t}</span> {fmtDur(v.min)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
