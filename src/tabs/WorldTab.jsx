import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import { supabase } from '../lib/supabase.js'
import { isInAustralia } from '../lib/geo.js'
import { AIRPORT_COORDS } from '../lib/airportCoords.js'
import { TripContext } from '../App.jsx'
import { tripColor } from '../lib/tripColors.js'
import { coverUrl } from '../lib/imgTransform.js'
import CountryFlags from '../components/CountryFlags.jsx'
import TripRecap from '../components/TripRecap.jsx'
import { INTRO, arcsShown, chronological } from '../lib/globeIntro.js'
import { tripPhase } from '../lib/tripPhase.js'
import { chapterRange, chapterCountries } from '../lib/tripGroups.js'
import { sectionTrips } from '../lib/tripPhase.js'
import { homeCoords } from '../lib/homePov.js'
import { shouldBadge, shouldTour, TOUR_SEEN_KEY } from '../lib/demoTour.js'
import DemoTour from '../components/DemoTour.jsx'

// Default framing for the "all trips" overview — centred on the
// Asia-Pacific cluster where 5 of 6 trips actually happened.
const OVERVIEW_POV = { lat: -8, lng: 122, altitude: 1.9 }

// Long enough that flying to a trip is something you watch rather than a
// transition you sit through. The trip opens as the globe settles.
const FLY_MS = 2100

// The cold open is off.
//
// It measured fine in a desktop browser and reads as jittery on a real phone,
// where the WebView is a slower engine and this is the heaviest thing the app
// ever asks of it — three seconds of WebGL while a hundred and fifty arcs
// mount. The timing logic and its tests stay (globeIntro.js) so turning it
// back on is one line, but it does not run until the globe itself is smooth
// on the device that matters.
const INTRO_ENABLED = false

// Once per page load, not once per mount — switching to Plan and back should
// not replay the opening.
let introPlayed = false

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

// Inside one trip, direction and who was aboard are the whole point — two
// people converging on a city from different places should read as two
// threads, and an out-and-back is a there and a back.
//
// Across a lifetime neither survives contact with the data: MEL→SYD and
// SYD→MEL are the same line on a sphere, drawn twice, then doubled again
// per traveller. 407 arcs for 148 actual routes, stacked on themselves — a
// mat rather than a map. So the overview keys routes undirected and
// person-agnostic, and earns the difference back as width.
function routeKey(dep, arr, person, withinTrip) {
  if (withinTrip) return `${dep}-${arr}-${person}`
  const [a, b] = dep < arr ? [dep, arr] : [arr, dep]
  return `${a}-${b}`
}

// Only label countries actually near this trip data — showing all ~180
// countries on the globe would bury the ones that matter.
const LABEL_FOCUS_DEG = 18
function nearAny(point, others) {
  return others.some((o) => Math.abs(point[0] - o[0]) < LABEL_FOCUS_DEG && Math.abs(point[1] - o[1]) < LABEL_FOCUS_DEG)
}

export default function WorldTab() {
  const { tripMeta, tripsLoaded, selectedTrip, setSelectedTrip, goToTab, jumpToJournal, openPlanner } =
    useContext(TripContext)
  // The one thing worth opening the app for when nothing is planned.
  const [memory, setMemory] = useState(null)
  const [flights, setFlights] = useState(null)
  // Booked-but-not-yet-flown legs. These live in planned_events (the
  // planner's world), not the flights table (the travel log's world), so
  // an upcoming trip drew nothing on the globe at all — Seeby's whole
  // September itinerary was invisible here. Rather than copying rows
  // between the two and creating a sync problem, read both and draw the
  // planned ones as dotted arcs: same globe, honestly distinguished.
  const [planned, setPlanned] = useState([])
  const [covers, setCovers] = useState({})
  const [names, setNames] = useState({})
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

  const sections = useMemo(() => sectionTrips(tripMeta), [tripMeta])

  // Nothing to look at yet, so the globe stops being a record and becomes an
  // invitation: pointed at wherever they are rather than at where this
  // account happens to have been, and spinning like it wants to be touched
  // instead of idling behind six trips.
  const isEmpty = tripsLoaded && !tripMeta.length

  // The walkthrough of the example trip. Decided once when the trips land
  // rather than on every render: it should not blink back on the instant
  // someone deletes their last real trip, and it must never re-run after
  // being dismissed. shouldTour holds the actual rules — see demoTour.js.
  const [tourOn, setTourOn] = useState(false)
  useEffect(() => {
    let dismissed = false
    try {
      dismissed = localStorage.getItem(TOUR_SEEN_KEY) === '1'
    } catch {
      // A browser that won't read localStorage gets the tour every launch,
      // which is the harmless direction to fail in.
    }
    if (shouldTour({ trips: tripMeta, tripsLoaded, dismissed })) setTourOn(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripsLoaded])

  const home = useMemo(() => homeCoords(), [])
  const overviewPov = isEmpty ? { lat: home.lat, lng: home.lng, altitude: 1.9 } : OVERVIEW_POV
  const idleSpin = isEmpty ? 0.9 : 0.35

  // "Three years ago today". Filtering happens here rather than in SQL
  // because matching a month-and-day needs an expression index to be worth
  // pushing down, and there are a couple of hundred entries — revisit if
  // that ever becomes thousands.
  useEffect(() => {
    if (!tripMeta.length) return
    let alive = true
    supabase
      .from('journal_entries')
      .select('entry_date,title,note,trip_id')
      .then(({ data }) => {
        if (!alive || !data) return
        const now = new Date()
        const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const thisYear = now.getFullYear()
        const bySlug = Object.fromEntries(tripMeta.map((t) => [t.id, t]))
        const hits = data
          .filter((e) => e.entry_date?.slice(5, 10) === md && Number(e.entry_date.slice(0, 4)) < thisYear)
          .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
        const hit = hits.find((e) => bySlug[e.trip_id])
        if (!hit) return
        const trip = bySlug[hit.trip_id]
        setMemory({
          ...hit,
          slug: trip.slug,
          tripTitle: trip.title,
          yearsAgo: thisYear - Number(hit.entry_date.slice(0, 4)),
        })
      })
    return () => {
      alive = false
    }
  }, [tripMeta])

  useEffect(() => {
    let alive = true
    supabase
      .from('flights')
      .select('flight_number,airline,trip_id,dep_airport,dep_city,dep_lat,dep_lon,arr_airport,arr_city,arr_lat,arr_lon,dep_time,distance_km,travellers,purpose')
      // A cancelled booking leaves a row behind but no line on the map.
      .eq('status', 'flown')
      .order('dep_time', { ascending: true })
      .then(({ data }) => alive && setFlights(data ?? []))
    supabase
      .from('planned_events')
      .select('trip_id,event_date,start_time,title,detail,traveler')
      .eq('kind', 'flight')
      .then(({ data }) => alive && setPlanned(data ?? []))
    // Flights record who was aboard by email; the globe should say "Seeby".
    // Reads are scoped to people you actually know, so this returns the
    // household and nobody else.
    supabase
      .from('profiles')
      .select('email,display_name')
      .then(({ data }) => {
        if (!alive) return
        setNames(Object.fromEntries((data ?? []).map((p) => [p.email.toLowerCase(), p.display_name || p.email])))
      })
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

  // Picking a trip used to fly the globe there and then put a card in front
  // of it whose only job was to be tapped through. The globe hands over
  // directly now: it flies in slowly enough to be worth watching, and when
  // it settles the trip opens — its recap if it's finished, its planner if
  // it hasn't happened. Closing comes back out to the whole globe.
  const [recapTrip, setRecapTrip] = useState(null)
  // The recap is *mounted* the moment you tap and *revealed* when the globe
  // lands. Mounting it at the end meant it appeared empty and then rebuilt
  // itself over the next second as five queries came back — a hero, then a
  // stray figure, then the prose shoving the share button down the page.
  // Mounting it at the start spends the 2.1s flight on the fetch instead, so
  // what fades up is finished.
  const [recapReady, setRecapReady] = useState(false)

  useEffect(() => {
    if (!selectedTripObj) {
      setRecapTrip(null)
      setRecapReady(false)
      return
    }
    const past = tripPhase(selectedTripObj) === 'past'
    if (past) setRecapTrip(selectedTripObj)
    const t = setTimeout(() => {
      if (past) setRecapReady(true)
      else {
        openPlanner(selectedTripObj.id)
        setSelectedTrip(null)
      }
    }, FLY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrip])

  // A phone screen reports a device pixel ratio near 3, and globe.gl clamps
  // that to 2 — still four times the fragments of 1x, every frame, for a
  // sphere nobody is inspecting at pixel level. 1.5 is indistinguishable on a
  // 400px-wide globe and cuts the shading work by nearly half, which is the
  // largest single lever on how this feels in a WebView.
  useEffect(() => {
    const g = globeEl.current
    if (!g?.renderer) return
    const r = g.renderer()
    if (r?.setPixelRatio) r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
  }, [dims.width, dims.height])

  // The globe keeps rendering every frame behind the recap, where nobody can
  // see it — a three.js scene on a phone GPU, competing for frames with a
  // sheet that is trying to slide. Park it once the recap is actually in
  // front; while it's still flying it very much needs those frames.
  useEffect(() => {
    const g = globeEl.current
    if (!g) return
    if (recapReady) g.pauseAnimation()
    else g.resumeAnimation()
  }, [recapReady])

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
      // A flight can carry more than one person; the arc is drawn per
      // traveller so two people leaving from different cities show as two
      // threads converging rather than one merged line. Unattributed rows
      // are assumed to be the account owner's and drawn on the shared lane.
      const aboard = f.travellers?.length ? f.travellers : ['']
      for (const person of aboard) {
        if (person) who.add(person)
        const key = routeKey(f.dep_airport, f.arr_airport, person, !!selectedTrip)
        if (!segs.has(key)) {
          segs.set(key, {
            key,
            from: [f.dep_lat, f.dep_lon],
            to: [f.arr_lat, f.arr_lon],
            label: `${f.dep_airport} → ${f.arr_airport}`,
            tripSlug: tripsById.get(f.trip_id)?.slug,
            traveler: person || null,
            flights: [],
          })
        }
        segs.get(key).flights.push(f)
      }
      for (const [code, city, pos] of [
        [f.dep_airport, f.dep_city, [f.dep_lat, f.dep_lon]],
        [f.arr_airport, f.arr_city, [f.arr_lat, f.arr_lon]],
      ]) {
        if (!apts.has(code)) apts.set(code, { code, city, pos, visits: 0 })
        apts.get(code).visits += 1
      }
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

  // The cold open. Once, on the first load of the session: the earth starts
  // far out and empty, your flights draw themselves onto it oldest-first, and
  // it comes toward you and settles into the Home framing. Skipped for
  // someone who tapped a trip before it could start, for an account with no
  // history to draw, and for anyone who has asked for less motion.
  const [introAt, setIntroAt] = useState(null)
  const [introArcs, setIntroArcs] = useState(null) // null = not intro-ing

  useEffect(() => {
    if (!INTRO_ENABLED || introPlayed || !flights || selectedTrip) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      introPlayed = true
      return
    }
    introPlayed = true
    setIntroArcs(0)
    setIntroAt(performance.now())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights])

  const introRunning = introArcs !== null

  useEffect(() => {
    if (!introRunning || introAt == null) return
    const g = globeEl.current
    if (!g) return
    const total = segments.length
    if (!total) {
      setIntroArcs(null)
      return
    }

    const controls = g.controls()
    controls.autoRotate = true
    // Faster than the idle drift while it's arriving, so the sphere reads as
    // turning rather than sitting there.
    controls.autoRotateSpeed = 1.1
    g.pointOfView({ ...overviewPov, altitude: INTRO.startAltitude }, 0)
    // Overlapping: the earth starts closing the distance while the arcs are
    // still landing, which is what makes it one move rather than two.
    const fly = setTimeout(() => g.pointOfView(overviewPov, INTRO.flyMs), INTRO.holdMs)

    let raf
    const tick = (now) => {
      const n = arcsShown(now - introAt, total)
      setIntroArcs(n)
      if (n >= total) {
        setIntroArcs(null)
        controls.autoRotateSpeed = idleSpin
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      clearTimeout(fly)
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introRunning, introAt, segments.length])

  // Any touch ends it: an intro you can't skip is a splash screen.
  const skipIntro = useCallback(() => {
    if (introArcs === null) return
    setIntroArcs(null)
    const g = globeEl.current
    if (!g) return
    g.pointOfView(overviewPov, 420)
    g.controls().autoRotateSpeed = idleSpin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introArcs, overviewPov, idleSpin])

  // Sorted once per data change rather than per frame: during the intro this
  // is read sixty times a second, and re-sorting 148 routes each time to
  // reveal one more of them is work for nothing. It has to live up here —
  // above the `if (!flights)` guard below — because a hook after a
  // conditional return is a hook that sometimes doesn't run.
  const introOrder = useMemo(() => chronological(segments), [segments])

  // Fly to the selection (or back to the overview) and toggle ambient
  // auto-rotate — spinning while idle, still while inspecting a trip.
  useEffect(() => {
    const g = globeEl.current
    if (!g) return
    // The intro owns the camera until it's finished; this effect fires on
    // mount too and would yank the earth to its final altitude on frame one.
    if (introRunning) return
    const controls = g.controls()
    if (selectedTrip) {
      controls.autoRotate = false
      const pts = segments.flatMap((s) => [s.from, s.to])
      const away = pts.filter((p) => !isInAustralia(p))
      const source = away.length ? away : pts
      if (source.length) {
        const lat = source.reduce((s, p) => s + p[0], 0) / source.length
        const lng = source.reduce((s, p) => s + p[1], 0) / source.length
        g.pointOfView({ lat, lng, altitude: 1.1 }, FLY_MS)
      }
    } else {
      controls.autoRotate = true
      controls.autoRotateSpeed = idleSpin
      g.pointOfView(overviewPov, 1200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrip, segments, isEmpty, home.lat, home.lng, introRunning])

  if (!flights) return <div className="tab-loading">loading the world…</div>

  // Two people flying into the same city on the same day would otherwise
  // overlap into one indistinguishable line. Lifting each traveller's arcs
  // to a different altitude separates them in 3D, so the paths read as two
  // threads that converge — which is the whole point of a shared trip.
  const allArcs = segments.map(toArc)

  function toArc(s) {
    return {
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
      // A route flown 39 times and one flown once used to be the same
      // half-pixel line. Now the repetition it already contains is what makes
      // it thick, so the overview reads as a shape rather than a tangle.
      // Capped, or the commuter routes would be ribbons.
      stroke: 0.32 + Math.min(s.flights.length, 24) * 0.055,
      flights: s.flights,
    }
  }

  // During the cold open the globe holds only the routes drawn so far, oldest
  // first — your history assembling itself in the order it happened rather
  // than a random flood.
  const arcsData = introRunning ? introOrder.slice(0, introArcs).map(toArc) : allArcs

  // Group same-city airports (e.g. Bangkok's BKK + DMK) into one marker —
  // otherwise two duck pins and two "Bangkok" labels land almost on top of
  // each other and blur together as you zoom in.
  // Keyed on the code when a row has no city, so airports missing one stay
  // separate pins rather than all collapsing into a single unnamed marker.
  const cityGroups = new Map()
  for (const a of airports) {
    const key = a.city || a.code
    if (!cityGroups.has(key)) cityGroups.set(key, { city: a.city || a.code, codes: [a.code], pos: a.pos, visits: 0 })
    else cityGroups.get(key).codes.push(a.code)
    // A city's visits are the sum across its airports — Bangkok is one
    // place whether you came through BKK or DMK.
    cityGroups.get(key).visits += a.visits || 0
  }
  const markerPoints = [...cityGroups.values()]

  // 86 duck pins is a smear, not a flourish — the duck was charming at six
  // airports and became a black mat at eighty-six. Everywhere you've landed
  // still gets a mark, sized by how often; the duck is kept for the handful
  // you actually live out of, so it stays special by being rare. Inside a
  // single trip there are only a few airports, so they all keep theirs.
  // Ranked, not thresholded: comparing against the last qualifying score
  // lets every airport tied with it through too, which on a long tail of
  // one-visit airports is all of them.
  //
  // And spread, not just ranked. Straight top-N by visits puts every duck
  // on the commuter airports — which for this account means Melbourne,
  // Sydney, Brisbane and London, so the entire Asia-Pacific half of the
  // globe had none while two corners had a pile. Taking the most-visited
  // city first and then skipping anything too close to one already chosen
  // spreads them around the sphere, so wherever the globe is turned there's
  // a duck rather than a field of dots.
  const DUCK_TOP = 8
  const DUCK_SEP_DEG = 14
  const duckCities = new Set(
    selectedTrip
      ? markerPoints.map((m) => m.city)
      : (() => {
          const chosen = []
          for (const m of [...markerPoints].sort((a, b) => b.visits - a.visits)) {
            if (chosen.length >= DUCK_TOP) break
            const crowded = chosen.some(
              (c) =>
                Math.abs(c.pos[0] - m.pos[0]) < DUCK_SEP_DEG &&
                Math.abs(c.pos[1] - m.pos[1]) < DUCK_SEP_DEG
            )
            if (!crowded) chosen.push(m)
          }
          return chosen.map((m) => m.city)
        })()
  )

  const pointsData = [
    ...markerPoints.map((m) => ({
      lat: m.pos[0],
      lng: m.pos[1],
      code: m.codes.join('/'),
      city: m.city,
      visits: m.visits,
      duck: duckCities.has(m.city),
    })),
    // One duck on an otherwise bare globe, roughly where they are. It's the
    // only thing on there, so it doubles as the answer to "is this thing
    // showing me anything?" — and it's the same pin every airport gets, so
    // the first one they add joins it rather than replacing it. Dropped as
    // soon as there's real travel to draw.
    ...(isEmpty && home.known
      ? [{ lat: home.lat, lng: home.lng, code: 'You', city: 'roughly here', home: true }]
      : []),
  ]

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
    <div
      className={`world-wrap globe-wrap${introRunning ? ' introing' : ''}`}
      ref={wrapRef}
      onPointerDown={skipIntro}
    >
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
        arcStroke={(d) => d.stroke}
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
          }${d.traveler ? ` <i>${escapeHtml(names[d.traveler] || d.traveler)}</i>` : ''}${d.flights
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
          if (!d.home && !d.duck) {
            // Everywhere else: a dot that grows with the number of visits.
            el.className = 'globe-dot'
            const r = Math.min(4 + Math.sqrt(d.visits || 1) * 1.6, 11)
            el.style.width = `${r}px`
            el.style.height = `${r}px`
            el.title = `${d.code} — ${d.city}`
            return el
          }
          el.className = `globe-duck-pin${d.home ? ' home' : ''}`
          el.title = d.home ? 'You, roughly' : `${d.code} — ${d.city}`
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
          controls.autoRotateSpeed = idleSpin
          globeEl.current.pointOfView(overviewPov, 0)
        }}
      />
      </div>

      {recapTrip && (
        <TripRecap
          trip={recapTrip}
          cover={covers[recapTrip.id]}
          reveal={recapReady}
          onClose={() => setSelectedTrip(null)}
        />
      )}

      {/* Only while the example is the only trip here, and never once the
          recap is open over the top of it. */}
      {tourOn && !selectedTrip && <DemoTour onDone={() => setTourOn(false)} />}

      {tripsLoaded && !tripMeta.length ? (
        <EmptyHome onPlan={() => goToTab('plan')} />
      ) : (
        <div className="world-trips">
          {memory && <MemoryCard memory={memory} onOpen={() => jumpToJournal(memory.slug, memory.entry_date)} />}

          {/* Past and future used to sit in one undifferentiated row, in
              hand-curated order, distinguishable only by reading the dates
              and doing the arithmetic. The strip now says which is which. */}
          {sections.map((section) => (
            <div key={section.id} className={`wt-section wt-section--${section.id}`}>
              <div className="wt-section-label">{section.label}</div>
              {section.items.map((item) => {
                if (item.type === 'trip')
                  return <TripCard key={item.trip.slug} t={item.trip} covers={covers} selectedTrip={selectedTrip} setSelectedTrip={setSelectedTrip} />

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
          ))}
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
// What Home said before this was nothing at all: an empty div under a
// slowly rotating, arc-less globe. Someone with no trips got no heading, no
// prompt and no way in.
function EmptyHome({ onPlan }) {
  return (
    <div className="world-empty">
      <div className="world-empty-title">Nothing on the globe yet</div>
      <div className="world-empty-body">
        Every trip you take lands here — the flights, the photos, the day you got lost. Start with
        one you've already booked, or just somewhere you fancy.
      </div>
      <button className="world-empty-btn" onClick={onPlan}>
        Plan a trip →
      </button>
    </div>
  )
}

// The reason to open the app on a Tuesday with nothing booked.
function MemoryCard({ memory, onOpen }) {
  return (
    <button className="wt-memory" onClick={onOpen}>
      <span className="wt-memory-when">
        {memory.yearsAgo === 1 ? 'A year ago today' : `${memory.yearsAgo} years ago today`}
      </span>
      <span className="wt-memory-title">{memory.title || memory.tripTitle}</span>
      {memory.note && <span className="wt-memory-note">{memory.note}</span>}
    </button>
  )
}

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
      className={`wt-card${active ? ' active' : ''}${shouldBadge(t) ? ' wt-card--demo' : ''}${bounce.className}`}
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
      {/* Says what it is for as long as it is there, not only during the
          tour. Six months from now, someone scrolling past "HK & South Korea"
          among their own trips should not have to wonder whether they went. */}
      {shouldBadge(t) && <span className="wt-demo-badge">Example</span>}
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
