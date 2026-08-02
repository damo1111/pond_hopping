import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import { supabase } from '../lib/supabase.js'
import { isInAustralia } from '../lib/geo.js'
import { AIRPORT_COORDS } from '../lib/airportCoords.js'
import { TripContext } from '../App.jsx'
import { tripColor } from '../lib/tripColors.js'
import { coverUrl } from '../lib/imgTransform.js'
import CountryFlags from '../components/CountryFlags.jsx'
import TripStoryCard from '../components/TripStoryCard.jsx'
import { groupTrips, chapterRange, chapterCountries } from '../lib/tripGroups.js'

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
  const { tripMeta, selectedTrip, setSelectedTrip, goToTab } = useContext(TripContext)
  const [flights, setFlights] = useState(null)
  // Booked-but-not-yet-flown legs. These live in planned_events (the
  // planner's world), not the flights table (the travel log's world), so
  // an upcoming trip drew nothing on the globe at all — Seeby's whole
  // September itinerary was invisible here. Rather than copying rows
  // between the two and creating a sync problem, read both and draw the
  // planned ones as dotted arcs: same globe, honestly distinguished.
  const [planned, setPlanned] = useState([])
  const [covers, setCovers] = useState({})
  const [countries, setCountries] = useState(null)
  // Which "chapter" (e.g. "2024 Gap Year") is currently drilled into on
  // the Home carousel — null means every chapter shows as one collapsed
  // card. Only one open at a time, accordion-style.
  const [expandedChapter, setExpandedChapter] = useState(null)
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
      .select('flight_number,airline,trip_id,dep_airport,dep_city,dep_lat,dep_lon,arr_airport,arr_city,arr_lat,arr_lon,dep_time,distance_km,traveler')
      .order('dep_time', { ascending: true })
      .then(({ data }) => alive && setFlights(data ?? []))
    supabase
      .from('planned_events')
      .select('trip_id,event_date,start_time,title,detail,traveler')
      .eq('kind', 'flight')
      .then(({ data }) => alive && setPlanned(data ?? []))
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
  const selectedTripObj = selectedTrip ? tripMeta.find((t) => t.slug === selectedTrip) : null

  // Dedupe flights into route segments (repeat sectors share one arc).
  // Travellers are part of the key: on a trip where two people flew in from
  // different places, their legs stay separate arcs so the globe shows two
  // threads converging on the destination rather than one merged line.
  const { segments, airports, travelers } = useMemo(() => {
    const segs = new Map()
    const apts = new Map()
    const who = new Set()
    for (const f of flights ?? []) {
      if (selectedTrip && tripsById.get(f.trip_id)?.slug !== selectedTrip) continue
      if (f.dep_lat == null || f.arr_lat == null) continue
      if (f.traveler) who.add(f.traveler)
      const key = `${f.dep_airport}-${f.arr_airport}-${f.traveler || ''}`
      if (!segs.has(key)) {
        segs.set(key, {
          key,
          from: [f.dep_lat, f.dep_lon],
          to: [f.arr_lat, f.arr_lon],
          label: `${f.dep_airport} → ${f.arr_airport}`,
          tripSlug: tripsById.get(f.trip_id)?.slug,
          traveler: f.traveler || null,
          flights: [],
        })
      }
      segs.get(key).flights.push(f)
      if (!apts.has(f.dep_airport)) apts.set(f.dep_airport, { code: f.dep_airport, city: f.dep_city, pos: [f.dep_lat, f.dep_lon] })
      if (!apts.has(f.arr_airport)) apts.set(f.arr_airport, { code: f.arr_airport, city: f.arr_city, pos: [f.arr_lat, f.arr_lon] })
    }

    // Booked legs from the planner. Coordinates come from AIRPORT_COORDS
    // rather than the row (planned_events has no lat/lon), and a leg is
    // skipped rather than guessed at if the airport isn't in that table.
    for (const p of planned) {
      const d = p.detail || {}
      if (selectedTrip && tripsById.get(p.trip_id)?.slug !== selectedTrip) continue
      const from = AIRPORT_COORDS[d.dep_airport]
      const to = AIRPORT_COORDS[d.arr_airport]
      if (!from || !to) continue
      if (p.traveler) who.add(p.traveler)
      const key = `planned-${d.dep_airport}-${d.arr_airport}-${p.traveler || ''}`
      if (!segs.has(key)) {
        segs.set(key, {
          key,
          from,
          to,
          label: `${d.dep_airport} → ${d.arr_airport}`,
          tripSlug: tripsById.get(p.trip_id)?.slug,
          traveler: p.traveler || null,
          planned: true,
          flights: [],
        })
      }
      segs.get(key).flights.push({
        flight_number: d.flight_number || p.title,
        dep_time: p.event_date,
        trip_id: p.trip_id,
      })
      if (!apts.has(d.dep_airport)) apts.set(d.dep_airport, { code: d.dep_airport, city: d.dep_city, pos: from })
      if (!apts.has(d.arr_airport)) apts.set(d.arr_airport, { code: d.arr_airport, city: d.arr_city, pos: to })
    }

    return { segments: [...segs.values()], airports: [...apts.values()], travelers: [...who].sort() }
  }, [flights, planned, selectedTrip, tripsById])

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

  // Two people flying into the same city on the same day would otherwise
  // overlap into one indistinguishable line. Lifting each traveller's arcs
  // to a different altitude separates them in 3D, so the paths read as two
  // threads that converge — which is the whole point of a shared trip.
  const arcsData = segments.map((s) => ({
    startLat: s.from[0],
    startLng: s.from[1],
    endLat: s.to[0],
    endLng: s.to[1],
    color: tripColor(s.tripSlug),
    label: s.label,
    traveler: s.traveler,
    planned: !!s.planned,
    altitude:
      s.traveler && travelers.length > 1
        ? 0.16 + travelers.indexOf(s.traveler) * 0.11
        : 0.22,
    flights: s.flights,
  }))

  // Group same-city airports (e.g. Bangkok's BKK + DMK) into one marker —
  // otherwise two duck pins and two "Bangkok" labels land almost on top of
  // each other and blur together as you zoom in.
  const cityGroups = new Map()
  for (const a of airports) {
    if (!cityGroups.has(a.city)) cityGroups.set(a.city, { city: a.city, codes: [a.code], pos: a.pos })
    else cityGroups.get(a.city).codes.push(a.code)
  }
  const markerPoints = [...cityGroups.values()]

  const pointsData = markerPoints.map((m) => ({ lat: m.pos[0], lng: m.pos[1], code: m.codes.join('/'), city: m.city }))

  // Country labels only where they're actually near an airport in view
  // (otherwise all ~180 countries would clutter the globe), and skipped
  // where a city label already sits almost on top of them (e.g. a small
  // country whose centroid lands right on its own capital's airport) —
  // the city name is the more useful of the two there.
  const airportPts = markerPoints.map((m) => m.pos)
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
  const cityLabels = markerPoints.map((m) => ({ kind: 'city', lat: m.pos[0], lng: m.pos[1], text: m.city }))
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
        arcAltitude={(d) => d.altitude}
        arcStroke={0.5}
        // Flown legs read as near-solid; booked-but-not-yet-flown ones as a
        // faster-moving dotted trail, so an upcoming trip is visibly a
        // promise rather than a memory.
        arcDashLength={(d) => (d.planned ? 0.08 : 0.4)}
        arcDashGap={(d) => (d.planned ? 0.12 : 0.25)}
        arcDashAnimateTime={(d) => (d.planned ? 2200 : 4000)}
        arcsTransitionDuration={400}
        arcLabel={(d) =>
          `<div class="globe-tip"><b>${escapeHtml(d.label)}</b>${
            d.planned ? ' <i>upcoming</i>' : ''
          }${d.traveler ? ` <i>${escapeHtml(d.traveler)}</i>` : ''}${d.flights
            .map(
              (f) =>
                `<br/>${escapeHtml(f.flight_number)} · ${escapeHtml(fmtDate(f.dep_time))}${
                  tripsById.get(f.trip_id) ? ` · ${escapeHtml(tripsById.get(f.trip_id).title)}` : ''
                }`
            )
            .join('')}</div>`
        }
        htmlElementsData={pointsData}
        htmlLat={(d) => d.lat}
        htmlLng={(d) => d.lng}
        htmlAltitude={0.015}
        htmlElement={(d) => {
          const el = document.createElement('div')
          el.className = 'globe-duck-pin'
          el.title = `${d.code} — ${d.city}`
          el.innerHTML = '<img src="/duck.png" alt="" />'
          return el
        }}
        labelsData={labelsData}
        labelLat={(d) => d.lat}
        labelLng={(d) => d.lng}
        labelText={(d) => d.text}
        labelSize={(d) => (d.kind === 'country' ? 1.1 : 0.95)}
        labelColor={(d) => (d.kind === 'country' ? 'rgba(245, 242, 235, 0.55)' : 'rgba(245, 242, 235, 0.9)')}
        labelDotRadius={0}
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

      {selectedTripObj ? (
        <TripStoryCard
          trip={selectedTripObj}
          cover={covers[selectedTripObj.id]}
          onClose={() => setSelectedTrip(null)}
          goToTab={goToTab}
        />
      ) : (
        <div className="world-trips">
          {groupTrips(tripMeta).map((item) => {
            if (item.type === 'trip') return <TripCard key={item.trip.slug} t={item.trip} covers={covers} selectedTrip={selectedTrip} setSelectedTrip={setSelectedTrip} />

            const { chapter, trips } = item
            const cover = trips.map((t) => covers[t.id]).find(Boolean)
            if (expandedChapter === chapter) {
              return (
                <div key={chapter} className="wt-chapter-open">
                  <ChapterSpine chapter={chapter} cover={cover} onClick={() => setExpandedChapter(null)} />
                  {trips.map((t) => (
                    <TripCard key={t.slug} t={t} covers={covers} selectedTrip={selectedTrip} setSelectedTrip={setSelectedTrip} />
                  ))}
                </div>
              )
            }

            return <ChapterCard key={chapter} chapter={chapter} trips={trips} cover={cover} onClick={() => setExpandedChapter(chapter)} />
          })}
        </div>
      )}
    </div>
  )
}

// A satisfying little press-pop on tap. Toggling a class and clearing it
// on animationend replays the keyframe every time (a plain :active can't
// bounce — it only holds while pressed).
function useBounce() {
  const [on, setOn] = useState(false)
  return {
    className: on ? ' bounce' : '',
    onPress: () => setOn(true),
    onAnimationEnd: () => setOn(false),
  }
}

// The collapsed "2024 Gap Year" era card — now led by the era's cover
// photo with a dimmed scrim so the title/flags read over it, matching the
// visual weight of a real trip card rather than a flat dashed box.
function ChapterCard({ chapter, trips, cover, onClick }) {
  const bounce = useBounce()
  return (
    <button
      className={`wt-card wt-chapter-card${bounce.className}`}
      onClick={() => {
        bounce.onPress()
        onClick()
      }}
      onAnimationEnd={bounce.onAnimationEnd}
    >
      {cover && (
        <span className="wt-cover wt-chapter-cover">
          <img src={coverUrl(cover, { width: 400, height: 220 })} alt="" loading="lazy" />
          <span className="wt-chapter-scrim" />
          <span className="wt-chapter-count">{trips.length} trips</span>
        </span>
      )}
      <span className="wt-flags">
        <CountryFlags countries={chapterCountries(trips)} size={20} />
      </span>
      <span className="wt-title">{chapter}</span>
      {!cover && <span className="wt-subtitle">{trips.length} trips</span>}
      <span className="wt-dates">{chapterRange(trips)}</span>
      <span className="wt-stats">Tap to explore ›</span>
    </button>
  )
}

// The "spine" shown once an era is open — was a flat grey vertical strip;
// now the era's cover runs up it behind a tint, so it reads as the closed
// book you tapped open, and bounces when you tap to close.
function ChapterSpine({ chapter, cover, onClick }) {
  const bounce = useBounce()
  return (
    <button
      className={`wt-card wt-chapter-collapse${bounce.className}`}
      onClick={() => {
        bounce.onPress()
        onClick()
      }}
      onAnimationEnd={bounce.onAnimationEnd}
    >
      {cover && <img className="wt-chapter-spine-img" src={coverUrl(cover, { width: 160, height: 440 })} alt="" loading="lazy" />}
      <span className="wt-chapter-spine-inner">
        <span className="wt-chapter-collapse-arrow">←</span>
        <span className="wt-title">{chapter}</span>
      </span>
    </button>
  )
}

function TripCard({ t, covers, selectedTrip, setSelectedTrip }) {
  const active = selectedTrip === t.slug
  const bounce = useBounce()
  return (
    <button
      className={`wt-card${active ? ' active' : ''}${bounce.className}`}
      onClick={() => {
        bounce.onPress()
        setSelectedTrip(active ? null : t.slug)
      }}
      onAnimationEnd={bounce.onAnimationEnd}
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
}
