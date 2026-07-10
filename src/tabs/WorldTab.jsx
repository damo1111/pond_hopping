import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import { supabase } from '../lib/supabase.js'
import { isInAustralia } from '../lib/geo.js'
import { TripContext } from '../App.jsx'
import { tripColor } from '../lib/tripColors.js'
import { coverUrl } from '../lib/imgTransform.js'
import CountryFlags from '../components/CountryFlags.jsx'

// Default framing for the "all trips" overview — centred on the
// Asia-Pacific cluster where 5 of 6 trips actually happened.
const OVERVIEW_POV = { lat: -8, lng: 122, altitude: 1.9 }

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

// Rough centroid from a GeoJSON country feature's largest ring (biggest
// landmass) so labels for countries with far-flung overseas territories
// (France, etc.) land on the mainland, not somewhere in the ocean between.
function countryCentroid(geometry) {
  let rings = []
  if (geometry.type === 'Polygon') rings = [geometry.coordinates[0]]
  else if (geometry.type === 'MultiPolygon') rings = geometry.coordinates.map((p) => p[0])
  if (!rings.length) return null
  const largest = rings.reduce((a, b) => (b.length > a.length ? b : a))
  let x = 0
  let y = 0
  for (const [lon, lat] of largest) {
    x += lon
    y += lat
  }
  return [y / largest.length, x / largest.length]
}

// Only label countries actually near this trip data — showing all ~180
// countries on the globe would bury the ones that matter.
const LABEL_FOCUS_DEG = 18
function nearAny(point, others) {
  return others.some((o) => Math.abs(point[0] - o[0]) < LABEL_FOCUS_DEG && Math.abs(point[1] - o[1]) < LABEL_FOCUS_DEG)
}

export default function WorldTab() {
  const { tripMeta, selectedTrip, setSelectedTrip } = useContext(TripContext)
  const [flights, setFlights] = useState(null)
  const [covers, setCovers] = useState({})
  const [countries, setCountries] = useState(null)
  const globeEl = useRef()
  const [dims, setDims] = useState({ width: 360, height: 600 })
  // A callback ref (not useRef + an empty-deps effect) — inside a
  // React.lazy()/Suspense boundary the plain-ref effect can run before
  // the DOM node is actually attached, silently skipping the measure.
  const [wrapEl, setWrapEl] = useState(null)
  const wrapRef = useCallback((node) => setWrapEl(node), [])

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
    let alive = true
    fetch('/globe/countries.geojson')
      .then((r) => r.json())
      .then((geo) => alive && setCountries(geo.features))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!wrapEl) return
    const measure = () => {
      const { width, height } = wrapEl.getBoundingClientRect()
      if (width > 0 && height > 0) setDims({ width, height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrapEl)
    return () => ro.disconnect()
  }, [wrapEl])

  const tripsById = useMemo(() => new Map(tripMeta.map((t) => [t.id, t])), [tripMeta])

  // Dedupe flights into route segments (repeat sectors share one arc).
  const { segments, airports } = useMemo(() => {
    const segs = new Map()
    const apts = new Map()
    for (const f of flights ?? []) {
      if (selectedTrip && tripsById.get(f.trip_id)?.slug !== selectedTrip) continue
      if (f.dep_lat == null || f.arr_lat == null) continue
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
    return { segments: [...segs.values()], airports: [...apts.values()] }
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

  // Country labels only where they're actually near an airport in view
  // (otherwise all ~180 countries would clutter the globe), and skipped
  // where a city label already sits almost on top of them (e.g. a small
  // country whose centroid lands right on its own capital's airport) —
  // the city name is the more useful of the two there.
  const airportPts = airports.map((a) => a.pos)
  const CITY_SUPPRESS_DEG = 5
  const countryLabels = (countries ?? [])
    .map((f) => {
      const c = countryCentroid(f.geometry)
      return c ? { kind: 'country', lat: c[0], lng: c[1], text: f.properties.NAME } : null
    })
    .filter(
      (d) =>
        d &&
        nearAny([d.lat, d.lng], airportPts) &&
        !airportPts.some((p) => Math.abs(d.lat - p[0]) < CITY_SUPPRESS_DEG && Math.abs(d.lng - p[1]) < CITY_SUPPRESS_DEG)
    )
  const cityLabels = airports.map((a) => ({ kind: 'city', lat: a.pos[0], lng: a.pos[1], text: a.city }))
  const labelsData = [...countryLabels, ...cityLabels]

  return (
    <div className="world-wrap globe-wrap" ref={wrapRef}>
      <div className="globe-shift">
      <Globe
        ref={globeEl}
        width={dims.width}
        height={dims.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="/globe/earth-blue-marble.jpg"
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
        labelsData={labelsData}
        labelLat={(d) => d.lat}
        labelLng={(d) => d.lng}
        labelText={(d) => d.text}
        labelSize={(d) => (d.kind === 'country' ? 1.1 : 0.95)}
        labelColor={(d) => (d.kind === 'country' ? 'rgba(245, 242, 235, 0.55)' : 'rgba(245, 242, 235, 0.9)')}
        labelDotRadius={(d) => (d.kind === 'country' ? 0 : 0.22)}
        labelAltitude={0.01}
        labelResolution={2}
        onGlobeReady={() => {
          const controls = globeEl.current.controls()
          controls.autoRotate = !selectedTrip
          controls.autoRotateSpeed = 0.35
          globeEl.current.pointOfView(OVERVIEW_POV, 0)
        }}
      />
      </div>

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
                  <img src={coverUrl(covers[t.id], { width: 400, height: 220 })} alt="" loading="lazy" />
                </span>
              )}
              <span className="wt-flags">
                <CountryFlags countries={t.countries} size={20} />
              </span>
              <span className="wt-title">{t.title}</span>
              {t.subtitle && <span className="wt-subtitle">{t.subtitle}</span>}
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
    </div>
  )
}
