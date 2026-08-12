import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import { supabase } from '../lib/supabase.js'
import { isInAustralia } from '../lib/geo.js'
import { AIRPORT_COORDS } from '../lib/airportCoords.js'
import { TripContext } from '../App.jsx'
import { tripColor } from '../lib/tripColors.js'
import { spanOf } from '../lib/dateRange.js'
import { words } from '../lib/sport.js'
import { coverUrl } from '../lib/imgTransform.js'
import CountryFlags from '../components/CountryFlags.jsx'
import DrawnCover from '../components/DrawnCover.jsx'
import TripRecap from '../components/TripRecap.jsx'
import { INTRO, arcsShown, chronological } from '../lib/globeIntro.js'
import { tripPhase } from '../lib/tripPhase.js'
import { chapterRange, chapterCountries } from '../lib/tripGroups.js'
import { sectionTrips } from '../lib/tripPhase.js'
import { overviewOf, homeCoords } from '../lib/homePov.js'
import { shouldBadge } from '../lib/demoTour.js'
import { pickVariant } from '../lib/variants.js'
import { track, whoAmI } from '../lib/analytics.js'
import GetTripsIn from '../components/GetTripsIn.jsx'

// Default framing for the "all trips" overview — centred on the
// Asia-Pacific cluster where 5 of 6 trips actually happened.
/* Where the earth sits before anybody has chosen a trip.
 *
 * The last resort rather than the answer: overviewOf() puts the camera on
 * whatever this person can actually see, and this is only used when there is
 * nothing to point at. It used to be the answer, and it is one collection's
 * centre — a signed-out visitor sees two European examples and opened on the
 * Java Sea, looking at nothing. */
const OVERVIEW_POV = { lat: -8, lng: 122, altitude: 1.9 }

// Long enough that flying to a trip is something you watch rather than a
// transition you sit through. The trip opens as the globe settles.
const FLY_MS = 2100

// How long you wait, after tapping a trip, before the thing you tapped opens.
//
// It used to be the whole FLY_MS: the globe flew for 2.1 seconds and only
// then did the trip appear. Two seconds of a phone rendering a WebGL sphere
// is the single least smooth thing this app does, and the reward for sitting
// through it is a screen that then covers the sphere completely — so the
// flight was both the jank and invisible in the end.
//
// The globe still flies. It just isn't in the way any more: the trip opens
// out of the card you tapped, promptly, and the sphere carries on behind it
// until the recap lands and pauses it.
// A floor and a ceiling rather than a fixed wait. The recap says when its
// five queries have landed; below the floor an instant swap reads as a
// glitch rather than a transition, and above the ceiling a slow connection
// should stop holding the door shut and let the page fill in as it arrives.
const OPEN_MIN_MS = 200
const OPEN_MAX_MS = 900

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

const fmtRange = (t) => spanOf(t, { empty: 'dates tbc' })

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
  const {
    tripMeta,
    tripsLoaded,
    selectedTrip,
    setSelectedTrip,
    goToTab,
    refreshTrips,
    jumpToJournal,
    openPlanner,
  } = useContext(TripContext)
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
  // Whether the cover query has answered — not whether it found anything.
  // Without this every card draws its sketch on the way in and then swaps
  // to a photograph a moment later, which reads as the app changing its
  // mind about your trips every time you sign in.
  const [coversIn, setCoversIn] = useState(false)
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

  // Which words the tile wears. Decided once per mount from the session id,
  // so it cannot change under somebody mid-scroll, and falls back to the
  // words that were there before if the test is ever switched off.
  const tile = useMemo(() => pickVariant('add_tile', whoAmI()), [])

  // Counted once a launch, not once a render. Without the ref this fires on
  // every re-render of Home — a scroll, a trip landing, the globe resizing —
  // and the denominator of the whole experiment quietly becomes "renders",
  // which is not a number about people at all.
  const counted = useRef(false)
  useEffect(() => {
    if (counted.current || !tile) return
    counted.current = true
    track('tile_shown', { test: 'add_tile', variant: tile.id })
  }, [tile])

  // Whether everything on the globe belongs to somebody else.
  //
  // This replaced a card. The card was the last line of the retired tour —
  // forty words and a "Right you are" button explaining why a stranger's
  // holiday was on your globe — and three things were wrong with it. The
  // example trip already wears an EXAMPLE stamp, so it said in forty words
  // what one word on the card next to it already said. It was the widest
  // thing in a rail of 172px cards. And being gated on firstRun.js meant it
  // appeared on the launch *after* the one it was about, which reads as the
  // app being broken rather than as the app being considerate.
  //
  // A state rather than an interruption. It is true exactly while somebody
  // has nothing of their own, so it needs no flag, no queue and no
  // dismissing — it goes when the first trip arrives, which is the moment
  // it stops being true.
  const nothingIsTheirs =
    tripsLoaded && tripMeta.length > 0 && tripMeta.every((t) => shouldBadge(t))

  // Nothing to look at yet, so the globe stops being a record and becomes an
  // invitation: pointed at wherever they are rather than at where this
  // account happens to have been, and spinning like it wants to be touched
  // instead of idling behind six trips.
  const isEmpty = tripsLoaded && !tripMeta.length

  // The way in. Reachable whether or not the globe is empty — someone with
  // the demo trip and nothing else needs this just as much as someone with
  // nothing at all.
  const [routesOpen, setRoutesOpen] = useState(false)
  const [apiToken, setApiToken] = useState(null)
  useEffect(() => {
    if (!routesOpen || apiToken) return
    supabase.rpc('my_api_token').then(({ data }) => setApiToken(data ?? null))
  }, [routesOpen, apiToken])

  const home = useMemo(() => homeCoords(), [])
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
    // A cover somebody chose wins over one scraped from an album.
    Promise.all([
      supabase.from('trips').select('id,cover_photo_url'),
      supabase.from('photo_cache').select('trip_id,urls,status'),
    ]).then(([t, c]) => {
      if (!alive) return
      const byTrip = {}
      for (const row of c.data ?? []) {
        if (row.status === 'ok' && row.urls?.[0]) byTrip[row.trip_id] = row.urls[0]
      }
      for (const row of t.data ?? []) {
        if (row.cover_photo_url) byTrip[row.id] = row.cover_photo_url
      }
      setCovers(byTrip)
      setCoversIn(true)
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

  const [recapTrip, setRecapTrip] = useState(null)
  // The recap is *mounted* the moment you tap and *revealed* a beat later.
  // Mounting it at the end meant it appeared empty and then rebuilt itself
  // over the next second as five queries came back — a hero, then a stray
  // figure, then the prose shoving the share button down the page. Mounting
  // it at the start spends the wait on the fetch instead, so what arrives is
  // finished.
  const [recapReady, setRecapReady] = useState(false)
  // Where the tapped card was, so the recap can come out of it rather than
  // materialise in the middle of the screen.
  const [origin, setOrigin] = useState(null)
  // Set by the effect below; called by the recap when its data lands.
  const loadedRef = useRef(null)

  useEffect(() => {
    if (!selectedTripObj) {
      setRecapTrip(null)
      setRecapReady(false)
      return
    }
    const past = tripPhase(selectedTripObj) === 'past'
    if (past) setRecapTrip(selectedTripObj)
    if (!past) {
      const t = setTimeout(() => {
        openPlanner(selectedTripObj.id)
        setSelectedTrip(null)
      }, OPEN_MIN_MS)
      return () => clearTimeout(t)
    }
    // Opens when the recap has something to show, never sooner than the
    // floor and never later than the ceiling.
    const start = Date.now()
    let floor = null
    const ceiling = setTimeout(() => setRecapReady(true), OPEN_MAX_MS)
    loadedRef.current = () => {
      const waited = Date.now() - start
      if (waited >= OPEN_MIN_MS) setRecapReady(true)
      else floor = setTimeout(() => setRecapReady(true), OPEN_MIN_MS - waited)
    }
    return () => {
      clearTimeout(ceiling)
      if (floor) clearTimeout(floor)
      loadedRef.current = null
    }
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

  // Where to stand when nothing is selected.
  //
  // Nothing at all to show: their own part of the world, which is the only
  // thing known about somebody with no trips yet. Otherwise the middle of
  // what they have — airports rather than segments, because this is about
  // where to stand, not what to draw.
  //
  // This has to live *below* the memo above, and that is not a matter of
  // taste. `airports` is a const, so reading it from anything declared
  // earlier in this function is a temporal dead zone: the component throws
  // on its first render, every time, for everybody. It built cleanly and
  // shipped, because a bundler has no opinion about the order in which a
  // function reads its own variables and nothing in the pipeline ever
  // rendered the page. Anything new that needs `airports`, `segments` or
  // `travelers` goes here or after.
  const overviewPov = useMemo(() => {
    if (isEmpty) return { lat: home.lat, lng: home.lng, altitude: 1.9 }
    const middle = overviewOf(airports.map((a) => a.pos), null)
    return middle ? { ...middle, altitude: 1.9 } : OVERVIEW_POV
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty, home.lat, home.lng, airports])

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
          origin={origin}
          onLoaded={() => loadedRef.current?.()}
          onClose={() => setSelectedTrip(null)}
        />
      )}

      {routesOpen && (
        <GetTripsIn
          mcpUrl={apiToken ? `https://pond.eend.app/api/mcp?key=${apiToken}` : null}
          // Was window.location.reload(). Adding one row to a list already
          // in memory does not justify booting the whole app — on iOS that
          // is a white flash, the globe rebuilt from scratch and every
          // query re-run, which reads as a crash at the moment somebody
          // first trusts the app with something. Fetching the list again
          // puts the trip on the globe with none of that.
          //
          // For "I'm off now" it deliberately stops there rather than
          // opening the new trip: selecting one that has not finished sends
          // you to the planner, and being thrown into a form is not what
          // that asked for. The trip appears where it belongs and you decide.
          //
          // Photographs are the other case, and it was getting the same
          // treatment. Somebody who has just watched three hundred pictures
          // upload and then pressed a button reading "Have a look" is asking
          // to be shown them, and was being left on the globe instead —
          // which reads as the button having done nothing at all.
          onCreated={async (trip, route) => {
            setRoutesOpen(false)
            await refreshTrips()
            if (route === 'photos' && trip?.slug) {
              setSelectedTrip(trip.slug)
              goToTab('photos')
            }
            // A pasted confirmation is an itinerary, and the itinerary is
            // the thing they just watched being read. Landing back on the
            // globe with a new card on it makes them go and find it.
            if (route === 'paste' && trip?.id) openPlanner(trip.id)
          }}
          onClose={(go) => {
            setRoutesOpen(false)
            if (go === 'plan') goToTab('plan')
          }}
        />
      )}

      {/* Where to go, once the opening has finished and there is nothing
          here that belongs to them.

          One line doing the two jobs the retired card did badly: it says
          what the stamped trip is, and — the half the card never did at all
          — it says what to do next. The doing half is a button rather than
          a description, because "tip some in" that you cannot tap is an
          instruction, and an instruction is a worse thing to hand somebody
          than a door.

          Outside the ternary below because it is absolutely positioned, so
          where it sits in the DOM does not matter; `nothingIsTheirs` needs
          trips to exist, so it can never appear over the empty home. */}
      {nothingIsTheirs && (
        <div className="wt-signpost">
          None of this is yours yet.{' '}
          <button
            onClick={() => {
              track('signpost_tapped')
              setRoutesOpen(true)
            }}
          >
            Tip some in
          </button>
          , or have a paddle round the example first.
        </div>
      )}

      {tripsLoaded && !tripMeta.length ? (
        <EmptyHome onPlan={() => goToTab('plan')} onGetIn={() => setRoutesOpen(true)} />
      ) : (
        <div className="world-trips">
          {memory && <MemoryCard memory={memory} onOpen={() => jumpToJournal(memory.slug, memory.entry_date)} />}

          {/* The door, sitting in the strip where the trips are rather than
              buried in a tab. It stays put once there are real trips —
              nobody's log is ever finished — but it leads the row while the
              only thing there is somebody else's example. */}
          <div className="wt-section wt-section--add">
            <div className="wt-section-label">Yours</div>
            <button
              className="wt-card wt-card--add"
              onClick={() => {
                track('tile_tapped', { test: 'add_tile', variant: tile?.id })
                setRoutesOpen(true)
              }}
            >
              {/* A real tile opens with a photograph 78px tall. This one
                  opened with a small mark and then 78px of nothing, which is
                  why it read as broken rather than empty. So it gets a cover
                  of its own, in the same box: the globe the app is built
                  around, a hop not yet taken, and the duck waiting on it. */}
              <span className="wt-cover wt-add-cover" aria-hidden="true">
                <svg viewBox="0 0 172 78" preserveAspectRatio="xMidYMid slice" role="img">
                  <g className="wt-add-globe" fill="none" strokeLinecap="round">
                    <circle cx="86" cy="60" r="44" />
                    <ellipse cx="86" cy="60" rx="17" ry="44" />
                    <ellipse cx="86" cy="60" rx="32" ry="44" />
                    <path d="M42 60h88M47 44h78M47 76h78" />
                  </g>
                  <path
                    className="wt-add-arc"
                    d="M36 44C56 14 116 12 138 34"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <circle className="wt-add-from" cx="36" cy="44" r="3.2" />
                  <g className="wt-add-to">
                    <circle cx="139" cy="34" r="7" />
                    <path d="M139 30.2v7.6M135.2 34h7.6" strokeLinecap="round" />
                  </g>
                </svg>
                <img className="wt-add-duck" src="/duck.png" alt="" />
              </span>
              <span className="wt-title">{tile?.title ?? 'Add a trip'}</span>
              <span className="wt-subtitle">{tile?.strap ?? "One you've taken, or one you're on"}</span>
              <span className="wt-dates">photos · email · ai</span>
            </button>
          </div>


          {/* Past and future used to sit in one undifferentiated row, in
              hand-curated order, distinguishable only by reading the dates
              and doing the arithmetic. The strip now says which is which. */}
          {sections.map((section) => (
            <div key={section.id} className={`wt-section wt-section--${section.id}`}>
              <div className="wt-section-label">{section.label}</div>
              {section.items.map((item) => {
                if (item.type === 'trip')
                  return <TripCard key={item.trip.slug} t={item.trip} covers={covers} coversIn={coversIn} selectedTrip={selectedTrip} setSelectedTrip={setSelectedTrip} onOrigin={setOrigin} />

                const { chapter, trips } = item
                const cover = trips.map((t) => covers[t.id]).find(Boolean)
                if (expandedChapter === chapter) {
                  return (
                    <div key={chapter} className="wt-chapter-open">
                      <ChapterSpine chapter={chapter} cover={cover} onClick={() => setExpandedChapter(null)} />
                      {trips.map((t) => (
                        <TripCard key={t.slug} t={t} covers={covers} coversIn={coversIn} selectedTrip={selectedTrip} setSelectedTrip={setSelectedTrip} onOrigin={setOrigin} />
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
function EmptyHome({ onPlan, onGetIn }) {
  return (
    <div className="world-empty">
      <div className="world-empty-title">Nothing on the globe yet</div>
      <div className="world-empty-body">
        Every trip you take lands here — the flights, the photos, the day you got lost. Start with
        one you've already booked, or just somewhere you fancy.
      </div>
      <div className="world-empty-btns">
        <button className="world-empty-btn" onClick={onGetIn}>
          Add a trip you've taken
        </button>
        <button className="world-empty-btn world-empty-btn--quiet" onClick={onPlan}>
          Plan a new one
        </button>
      </div>
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

// `coversIn` is a prop, not a closure read: this is a sibling of the
// component holding that state, not a child of it, so a free variable here
// is a ReferenceError — and a ReferenceError during render takes the whole
// app down to "That didn't work" on a cold load, before a card ever draws.
function TripCard({ t, covers, coversIn, selectedTrip, setSelectedTrip, onOrigin }) {
  const active = selectedTrip === t.slug
  const bounce = useBounce()
  // The example first: it is the app introducing itself and outranks whose
  // it is. Then trips that are not yours — shared with you, or public and
  // somebody else's. `owned` is absent outside the trip_meta view, and an
  // absent answer earns no sash rather than a wrong one.
  const sash = shouldBadge(t) ? 'Example' : t.owned === false ? 'Shared' : null
  return (
    <button
      className={`wt-card${active ? ' active' : ''}${shouldBadge(t) ? ' wt-card--demo' : ''}${
        sash ? ' wt-card--sashed' : ''
      }${sash === 'Shared' ? ' wt-card--shared' : ''}${bounce.className}`}
      onClick={(e) => {
        bounce.onPress()
        // Measured at the moment of the tap, from the element that was
        // tapped — the carousel scrolls, so anything remembered earlier
        // would point somewhere the card no longer is.
        onOrigin?.(e.currentTarget.getBoundingClientRect())
        setSelectedTrip(active ? null : t.slug)
      }}
      onAnimationEnd={bounce.onAnimationEnd}
    >
      {/* Always a cover, drawn when there is no photograph.
          //
          Three cards in a row had three different silhouettes: one with a
          picture, one with flags where a picture goes, one with nothing but
          white. A card is a card — the shape should say "trip", not "how
          much has been filled in yet". The first pass at that was a wash of
          the trip's colour, which fixed the shape and nothing else: it still
          looked like a tile waiting to load. So it gets an actual drawing,
          in the trip's colour, in the same hand as the Add-a-trip tile. */}
      <span
        className={`wt-cover${covers[t.id] || !coversIn ? '' : ' wt-cover--drawn'}`}
        style={{ '--card-accent': tripColor(t.slug) }}
      >
        {/* The drawing waits until we know there is no photograph. Before
            that it is simply the trip's colour — a card still loading, which
            is what it is, rather than a wrong answer shown confidently and
            then withdrawn. */}
        {covers[t.id] ? (
          <img src={coverUrl(covers[t.id], { width: 700, height: 385 })} alt="" loading="lazy" />
        ) : coversIn ? (
          <DrawnCover slug={t.slug} />
        ) : null}
      </span>
      {/* Says what it is for as long as it is there, not only during the
          tour. Six months from now, someone scrolling past "HK & South Korea"
          among their own trips should not have to wonder whether they went.
          Across the corner rather than in the card's own column: a stamp,
          not a label, because it describes your relationship to the trip
          rather than anything about the trip. */}
      {sash && <span className={`wt-sash wt-sash--${sash.toLowerCase()}`}>{sash}</span>}
      {/* Three cards in a row, three different heights of first line: one
          with two flags, one with none, one with a subtitle the others
          lacked. Every row below inherited the offset, so the titles and
          the dates on adjacent cards sat at different heights and the strip
          read as three unrelated objects. Each slot now holds its line
          whether or not it has anything in it, and the flags say
          "somewhere" rather than saying nothing. */}
      <span className="wt-flags">
        <CountryFlags countries={t.countries} size={20} unknown />
      </span>
      <span className="wt-title">{t.title}</span>
      <span className="wt-subtitle">{t.subtitle || ' '}</span>
      <span className="wt-dates">{fmtRange(t)}</span>
      <span className="wt-stats">
        {t.flight_count > 0 && <>✈ {t.flight_count}&nbsp;&nbsp;</>}
        {/* Whichever sport the trip is mostly made of — a trip of walks
            was being labelled with somebody running. */}
        {t.run_count > 0 && <>{words(t.run_sport).icon} {t.run_count}&nbsp;&nbsp;</>}
        {t.journal_count > 0 && <>📔 {t.journal_count}</>}
      </span>
    </button>
  )
}
