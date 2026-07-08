import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import { greatCircle } from '../lib/geo.js'
import { fetchAircraftPhoto } from '../lib/planespotters.js'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtTime(iso) {
  if (!iso) return ''
  // keep the flight's local time (the ISO carries its own offset)
  return iso.slice(11, 16)
}
function fmtDuration(min) {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

// Animates the great-circle arc drawing in when the card expands.
function AnimatedRoute({ from, to }) {
  const map = useMap()
  const full = useRef(greatCircle(from, to, 96))
  const [n, setN] = useState(2)

  useEffect(() => {
    map.invalidateSize()
    map.fitBounds(full.current, { padding: [26, 26], animate: false })
    let raf
    const total = full.current.length
    const start = performance.now()
    const dur = 900
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur)
      setN(Math.max(2, Math.round(p * total)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [map])

  const shown = full.current.slice(0, n)
  const head = shown[shown.length - 1]
  return (
    <>
      <Polyline positions={shown} pathOptions={{ color: '#A8842C', weight: 2, dashArray: '5 7', opacity: 0.95 }} />
      <CircleMarker center={from} radius={4} pathOptions={{ color: '#A8842C', fillColor: '#A8842C', fillOpacity: 1, weight: 0 }} />
      <CircleMarker center={to} radius={4} pathOptions={{ color: '#A8842C', fillColor: '#F5F2EB', fillOpacity: 1, weight: 2 }} />
      {head && <CircleMarker center={head} radius={3} pathOptions={{ color: '#1A1611', fillColor: '#1A1611', fillOpacity: 1, weight: 0 }} />}
    </>
  )
}

export default function FlightCard({ flight, aircraftType }) {
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState(undefined) // undefined = not loaded, null = none
  const hasRoute =
    flight.dep_lat != null && flight.dep_lon != null && flight.arr_lat != null && flight.arr_lon != null

  useEffect(() => {
    if (!open || photo !== undefined) return
    let alive = true
    if (!flight.registration) {
      setPhoto(null)
      return
    }
    fetchAircraftPhoto(flight.registration).then((p) => alive && setPhoto(p))
    return () => {
      alive = false
    }
  }, [open, photo, flight.registration])

  const from = [flight.dep_lat, flight.dep_lon]
  const to = [flight.arr_lat, flight.arr_lon]

  return (
    <div className={`flight-card${open ? ' open' : ''}`}>
      <button className="flight-head" onClick={() => setOpen((o) => !o)}>
        <div className="flight-route">
          <span className="fr-code">{flight.dep_airport}</span>
          <span className="fr-arrow">→</span>
          <span className="fr-code">{flight.arr_airport}</span>
        </div>
        <div className="flight-sub">
          <span className="flight-no">{flight.flight_number}</span>
          <span className="flight-dot">·</span>
          <span>{fmtDate(flight.dep_time)}</span>
          {flight.distance_km ? (
            <>
              <span className="flight-dot">·</span>
              <span>{flight.distance_km.toLocaleString()} km</span>
            </>
          ) : null}
        </div>
        <div className="flight-cities">
          {flight.dep_city} — {flight.arr_city}
        </div>
      </button>

      {open && (
        <div className="flight-body">
          <div className="flight-photo">
            {photo === undefined && <div className="photo-skel">loading aircraft…</div>}
            {photo === null && (
              <div className="photo-none">
                {flight.registration
                  ? `No spotter photo for ${flight.registration} yet`
                  : 'Add registration to load aircraft photo'}
              </div>
            )}
            {photo && (
              <a href={photo.link} target="_blank" rel="noreferrer" className="photo-link">
                <img src={photo.thumb} alt={`${flight.registration}`} loading="lazy" />
                <span className="photo-credit">
                  {flight.registration} · © {photo.photographer} / Planespotters
                </span>
              </a>
            )}
          </div>

          {hasRoute && (
            <div className="flight-map">
              <MapContainer
                center={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]}
                zoom={3}
                zoomControl={false}
                attributionControl={false}
                dragging={false}
                scrollWheelZoom={false}
                doubleClickZoom={false}
                style={{ height: '100%', width: '100%', background: '#EDE9DF' }}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  subdomains="abcd"
                />
                <AnimatedRoute from={from} to={to} />
              </MapContainer>
            </div>
          )}

          <div className="flight-meta">
            <Meta label="Airline" value={flight.airline} />
            <Meta label="Aircraft" value={aircraftType?.name} />
            <Meta label="Reg" value={flight.registration} mono />
            <Meta label="Cabin" value={flight.cabin} />
            <Meta label="Seat" value={flight.seat} mono />
            <Meta label="Config" value={flight.config} mono />
            <Meta label="Depart" value={fmtTime(flight.dep_time)} mono />
            <Meta label="Arrive" value={fmtTime(flight.arr_time)} mono />
            <Meta label="Duration" value={fmtDuration(durationMin(flight))} mono />
          </div>

          <a
            className="fr24-link"
            href={`https://www.flightradar24.com/data/flights/${(flight.flight_number || '').toLowerCase()}`}
            target="_blank"
            rel="noreferrer"
          >
            View on FlightRadar24 →
          </a>
        </div>
      )}
    </div>
  )
}

function durationMin(flight) {
  if (!flight.dep_time || !flight.arr_time) return null
  const d = (new Date(flight.arr_time) - new Date(flight.dep_time)) / 60000
  return d > 0 ? Math.round(d) : null
}

function Meta({ label, value, mono }) {
  if (!value) return null
  return (
    <div className="meta-cell">
      <div className="meta-label">{label}</div>
      <div className={`meta-value${mono ? ' mono' : ''}`}>{value}</div>
    </div>
  )
}
