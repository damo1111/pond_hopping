import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet'
import { supabase } from '../lib/supabase.js'
import { greatCircle } from '../lib/geo.js'
import { TripContext } from '../App.jsx'

const GOLD = '#A8842C'
const INK = '#1A1611'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Sequentially animates route segments: each draws in over ~drawMs,
// then a short pause before the next. Already-drawn routes stay.
function useSequence(segments, drawMs = 420, pauseMs = 110) {
  const [state, setState] = useState({ done: 0, progress: 0 })
  const raf = useRef()

  useEffect(() => {
    if (!segments.length) return
    let done = 0
    let start = performance.now() + 350 // beat before the briefing starts
    const tick = (t) => {
      if (done >= segments.length) return
      const p = (t - start) / drawMs
      if (p >= 1) {
        done += 1
        start = t + pauseMs
        setState({ done, progress: 0 })
      } else {
        setState({ done, progress: Math.max(0, p) })
      }
      if (done < segments.length) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [segments, drawMs, pauseMs])

  return state
}

export default function WorldTab() {
  const { tripMeta, selectedTrip } = useContext(TripContext)
  const [flights, setFlights] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('flights')
      .select('flight_number,airline,trip_id,dep_airport,dep_city,dep_lat,dep_lon,arr_airport,arr_city,arr_lat,arr_lon,dep_time,distance_km')
      .order('dep_time', { ascending: true })
      .then(({ data }) => alive && setFlights(data ?? []))
    return () => {
      alive = false
    }
  }, [])

  const tripsById = useMemo(() => new Map(tripMeta.map((t) => [t.id, t])), [tripMeta])

  // Dedupe flights into route segments (repeat sectors share one line).
  const { segments, airports, stats } = useMemo(() => {
    const segs = new Map()
    const apts = new Map()
    let km = 0
    for (const f of flights ?? []) {
      if (selectedTrip && tripsById.get(f.trip_id)?.slug !== selectedTrip) continue
      if (f.dep_lat == null || f.arr_lat == null) continue
      km += f.distance_km || 0
      const key = `${f.dep_airport}-${f.arr_airport}`
      if (!segs.has(key)) {
        segs.set(key, {
          key,
          from: [f.dep_lat, f.dep_lon],
          to: [f.arr_lat, f.arr_lon],
          path: greatCircle([f.dep_lat, f.dep_lon], [f.arr_lat, f.arr_lon], 72),
          label: `${f.dep_airport} → ${f.arr_airport}`,
          km: f.distance_km,
          flights: [],
        })
      }
      segs.get(key).flights.push(f)
      if (!apts.has(f.dep_airport)) apts.set(f.dep_airport, { code: f.dep_airport, city: f.dep_city, pos: [f.dep_lat, f.dep_lon] })
      if (!apts.has(f.arr_airport)) apts.set(f.arr_airport, { code: f.arr_airport, city: f.arr_city, pos: [f.arr_lat, f.arr_lon] })
    }
    const flightCount = [...segs.values()].reduce((s, x) => s + x.flights.length, 0)
    return {
      segments: [...segs.values()],
      airports: [...apts.values()],
      stats: { flights: flightCount, km, airports: apts.size },
    }
  }, [flights, selectedTrip, tripsById])

  const seq = useSequence(segments)

  if (!flights) return <div className="tab-loading">loading the world…</div>

  const bounds = segments.length
    ? segments.flatMap((s) => [s.from, s.to])
    : [[-40, 100], [45, 155]]

  return (
    <div className="world-wrap">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [34, 34] }}
        zoomControl={false}
        attributionControl={false}
        worldCopyJump
        style={{ height: '100%', width: '100%', background: '#EDE9DF' }}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" />

        {segments.map((seg, i) => {
          if (i > seq.done) return null
          const pts =
            i < seq.done ? seg.path : seg.path.slice(0, Math.max(2, Math.round(seq.progress * seg.path.length)))
          return (
            <Polyline
              key={seg.key}
              positions={pts}
              pathOptions={{ color: GOLD, weight: 2, dashArray: '5 7', opacity: 0.9 }}
            >
              <Popup>
                <div className="world-pop">
                  <div className="world-pop-route">{seg.label}</div>
                  {seg.flights.map((f, j) => (
                    <div key={j} className="world-pop-flight">
                      <span className="wp-no">{f.flight_number}</span> · {fmtDate(f.dep_time)}
                      {tripsById.get(f.trip_id) ? ` · ${tripsById.get(f.trip_id).title}` : ''}
                    </div>
                  ))}
                </div>
              </Popup>
            </Polyline>
          )
        })}

        {airports.map((a) => (
          <CircleMarker
            key={a.code}
            center={a.pos}
            radius={4}
            pathOptions={{ color: INK, fillColor: '#FFFFFF', fillOpacity: 1, weight: 1.5 }}
          >
            <Popup>
              <div className="world-pop">
                <div className="world-pop-route">{a.code}</div>
                <div className="world-pop-flight">{a.city}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="world-brief">
        <div className="wb-title">
          {selectedTrip ? tripsById.get([...tripsById.keys()].find((id) => tripsById.get(id)?.slug === selectedTrip))?.title ?? 'mission' : 'the mini gap year'}
        </div>
        <div className="wb-stats">
          {stats.flights} flights · {stats.km.toLocaleString()} km · {stats.airports} airports
        </div>
      </div>
    </div>
  )
}
