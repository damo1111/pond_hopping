import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import { greatCircle } from '../lib/geo.js'
import { AIRPORT_COORDS } from '../lib/airportCoords.js'

// The line between two airports, drawing itself.
//
// Lifted out of FlightCard because a planned flight had no map at all — the
// card for a flight you have booked showed terminals, a gate, a delay guess
// and a large photograph of the aeroplane, and never once said where it was
// going. David, 12 August: "planned flights should still have a map."
//
// The two cards are otherwise very different — one is a record, the other is
// a set of fields you can still edit — so this is the arc and nothing else.

/** Animates the great-circle arc drawing in when the card expands. */
function AnimatedRoute({ from, to }) {
  const map = useMap()
  const full = useRef(greatCircle(from, to, 96))
  const [n, setN] = useState(2)

  useEffect(() => {
    // The container was zero-sized while the card was collapsed, so without
    // this Leaflet fits the bounds to a box of no width and lands somewhere
    // in the ocean.
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

/**
 * @param from  [lat, lon], or omit and pass IATA codes instead
 * @param to    [lat, lon]
 * @param dep   IATA, looked up when `from` is not given
 * @param arr   IATA, looked up when `to` is not given
 *
 * Renders nothing at all when either end is unknown — a map of one airport
 * says less than no map, and half the flights in a planner are typed in
 * before anybody has filled in where they land.
 */
export default function RouteMap({ from, to, dep, arr, className = 'flight-map' }) {
  const a = from ?? (dep ? AIRPORT_COORDS[dep] : null)
  const b = to ?? (arr ? AIRPORT_COORDS[arr] : null)
  if (!a || !b) return null

  return (
    <div className={className}>
      <MapContainer
        center={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]}
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
        <AnimatedRoute from={a} to={b} />
      </MapContainer>
    </div>
  )
}
