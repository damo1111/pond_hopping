import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import { supabase } from '../lib/supabase.js'
import { isInAustralia } from '../lib/geo.js'
import { TripContext } from '../App.jsx'

// One accent per trip so overlapping routes read as distinct journeys
// instead of one dense gold tangle.
const TRIP_COLORS = {
  'south-korea': '#D4AF37',
  'new-zealand': '#5FA876',
  'china-japan': '#D9614F',
  'singapore-malaysia': '#4FA8C9',
  bangkok: '#E0954C',
  'sri-lanka-voyage': '#9B7FD4',
}
const tripColor = (slug) => TRIP_COLORS[slug] || '#A8842C'

// Default framing for the "all trips" overview — centred on the
// Asia-Pacific cluster where 5 of 6 trips actually happened.
const OVERVIEW_POV = { lat: -8, lng: 122, altitude: 2.3 }

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtRange(t) {
  if (!t.start_date) return 'dates tbc'
  const opt = { day: 'numeric', month: 'short' }
  const a = new Date(t.start_date).toLocaleDateString('en-GB', opt)
  const b = t.end_date ? new Date(t.end_date).toLocaleDateString('en-GB', opt) : null
  return b ? `${a} – ${b}` : a
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export default function WorldTab() {
  const { tripMeta, selectedTrip, setSelectedTrip } = useContext(TripContext)
  const [flights, setFlights] = useState(null)
  const [covers, setCovers] = useState({})
  const globeEl = useRef()
  const wrapRef = useRef()
  const [dims, setDims] = useState({ width: 360, height: 600 })

  useEffect(() => {
    let alive = true
    supabase
      .from('flights')
      .select('flight_number,airline,trip_id,dep_airport,dep_city,dep_lat,dep_lon,arr_airport,arr_city,arr_lat,arr_lon,dep_time,distance_km')
      .order('dep_time', { ascending: true })
      .then(({ data }) => alive && setFlights(data ?? []))
    supabase
      .from('photo_cache')
      .select('trip_id,urls,status')
      .then(({ data }) => {
        if (!alive) return
        const byTrip = {}
        for (const row of data ?? []) {
          if (row.status === 'ok' && row.urls?.[0]) byTrip[row.trip_id] = row.urls[0]
        }
        setCovers(byTrip)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setDims({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const tripsById = useMemo(() => new Map(tripMeta.map((t) => [t.id, t])), [tripMeta])

  // Dedupe flights into route segments (repeat sectors share one arc).
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
          label: `${f.dep_airport} → ${f.arr_airport}`,
          tripSlug: tripsById.get(f.trip_id)?.slug,
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

  // Fly to the selection (or back to the overview) and toggle ambient
  // auto-rotate — spinning while idle, still while inspecting a trip.
  useEffect(() => {
    const g = globeEl.current
    if (!g) return
    const controls = g.controls()
    if (selectedTrip) {
      controls.autoRotate = false
      const pts = segments.flatMap((s) => [s.from, s.to])
      const away = pts.filter((p) => !isInAustralia(p))
      const source = away.length ? away : pts
      if (source.length) {
        const lat = source.reduce((s, p) => s + p[0], 0) / source.length
        const lng = source.reduce((s, p) => s + p[1], 0) / source.length
        g.pointOfView({ lat, lng, altitude: 1.1 }, 1200)
      }
    } else {
      controls.autoRotate = true
      controls.autoRotateSpeed = 0.35
      g.pointOfView(OVERVIEW_POV, 1200)
    }
  }, [selectedTrip, segments])

  if (!flights) return <div className="tab-loading">loading the world…</div>

  const arcsData = segments.map((s) => ({
    startLat: s.from[0],
    startLng: s.from[1],
    endLat: s.to[0],
    endLng: s.to[1],
    color: tripColor(s.tripSlug),
    label: s.label,
    flights: s.flights,
  }))

  const pointsData = airports.map((a) => ({ lat: a.pos[0], lng: a.pos[1], code: a.code, city: a.city }))

  return (
    <div className="world-wrap globe-wrap" ref={wrapRef}>
      <Globe
        ref={globeEl}
        width={dims.width}
        height={dims.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="/globe/earth-dark.jpg"
        showAtmosphere
        atmosphereColor="#A8842C"
        atmosphereAltitude={0.18}
        arcsData={arcsData}
        arcStartLat={(d) => d.startLat}
        arcStartLng={(d) => d.startLng}
        arcEndLat={(d) => d.endLat}
        arcEndLng={(d) => d.endLng}
        arcColor={(d) => d.color}
        arcStroke={0.5}
        arcDashLength={0.4}
        arcDashGap={0.25}
        arcDashAnimateTime={4000}
        arcsTransitionDuration={400}
        arcLabel={(d) =>
          `<div class="globe-tip"><b>${escapeHtml(d.label)}</b>${d.flights
            .map(
              (f) =>
                `<br/>${escapeHtml(f.flight_number)} · ${escapeHtml(fmtDate(f.dep_time))}${
                  tripsById.get(f.trip_id) ? ` · ${escapeHtml(tripsById.get(f.trip_id).title)}` : ''
                }`
            )
            .join('')}</div>`
        }
        pointsData={pointsData}
        pointLat={(d) => d.lat}
        pointLng={(d) => d.lng}
        pointColor={() => '#F5F2EB'}
        pointRadius={0.35}
        pointAltitude={0.01}
        pointsMerge
        pointLabel={(d) => `<div class="globe-tip"><b>${escapeHtml(d.code)}</b><br/>${escapeHtml(d.city)}</div>`}
        onGlobeReady={() => {
          const controls = globeEl.current.controls()
          controls.autoRotate = !selectedTrip
          controls.autoRotateSpeed = 0.35
          globeEl.current.pointOfView(OVERVIEW_POV, 0)
        }}
      />

      <div className="world-trips">
        {tripMeta.map((t) => {
          const active = selectedTrip === t.slug
          return (
            <button
              key={t.slug}
              className={`wt-card${active ? ' active' : ''}`}
              onClick={() => setSelectedTrip(active ? null : t.slug)}
            >
              {covers[t.id] && (
                <span className="wt-cover">
                  <img src={`${covers[t.id]}=w400-h220-c`} alt="" loading="lazy" />
                </span>
              )}
              <span className="wt-flags">{t.countries?.join(' ')}</span>
              <span className="wt-title">{t.title}</span>
              <span className="wt-dates">{fmtRange(t)}</span>
              <span className="wt-stats">
                {t.flight_count > 0 && <>✈ {t.flight_count}&nbsp;&nbsp;</>}
                {t.run_count > 0 && <>🏃 {t.run_count}&nbsp;&nbsp;</>}
                {t.journal_count > 0 && <>📔 {t.journal_count}</>}
              </span>
            </button>
          )
        })}
      </div>

      <div className="world-brief">
        <div className="wb-title">
          {selectedTrip ? tripsById.get([...tripsById.keys()].find((id) => tripsById.get(id)?.slug === selectedTrip))?.title ?? 'mission' : 'the digital nomad life'}
        </div>
        <div className="wb-stats">
          {stats.flights} flights · {stats.km.toLocaleString()} km · {stats.airports} airports
        </div>
      </div>
    </div>
  )
}
