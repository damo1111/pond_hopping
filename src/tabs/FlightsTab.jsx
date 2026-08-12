import { useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import FlightCard from '../components/FlightCard.jsx'
import FlightTriage from '../components/FlightTriage.jsx'
import PlanFlightCard from '../components/planner/PlanFlightCard.jsx'
import RouteStrip from '../components/RouteStrip.jsx'
import { stripOf } from '../lib/routeStrip.js'
import { tripColor } from '../lib/tripColors.js'
import CountryFlags from '../components/CountryFlags.jsx'
import { AIRPORT_COORDS } from '../lib/airportCoords.js'
import { findConflicts } from '../lib/flightAttribution.js'
import { useAuth } from '../lib/AuthContext.jsx'

export default function FlightsTab() {
  const { tripMeta, selectedTrip } = useContext(TripContext)
  const { user } = useAuth()
  const myEmail = (user?.email || '').toLowerCase()
  const [flights, setFlights] = useState(null)
  // Booked-but-not-yet-flown legs live in planned_events, not flights, so
  // an upcoming trip showed an empty Flights tab even with everything
  // booked — Seeby's whole September itinerary, for instance. Same split
  // the globe had. Read both rather than copying rows between them.
  const [planned, setPlanned] = useState([])
  const [drafts, setDrafts] = useState([])
  const [error, setError] = useState(null)
  // null until the reader touches a year, so the newest one can default to
  // open without that default fighting the first click to close it.
  const [openYears, setOpenYears] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  // Bumped when the review screen saves, to re-pull the list underneath it.
  const [reloads, setReloads] = useState(0)
  // Which flight is open, per trip — the strip above each section draws it.
  const [showing, setShowing] = useState({})

  useEffect(() => {
    let alive = true
    // Cancelled flights stay in the table — byAir knows they were booked and
    // the row is the evidence — but they didn't happen, so they don't belong
    // in the log, the distance total or on the globe.
    supabase
      .from('flights')
      .select('*, aircraft_types(icao,name,manufacturer)')
      .eq('status', 'flown')
      .order('dep_time', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setError(error.message)
        else setFlights(data ?? [])
      })
    supabase
      .from('planned_events')
      .select('*')
      .eq('kind', 'flight')
      .order('event_date', { ascending: true })
      .then(({ data }) => alive && setPlanned(data ?? []))
    // tripMeta comes from the trip_meta view, which filters to confirmed
    // trips — so drafts (exactly the ones with upcoming flights) aren't in
    // it. Fetch them here rather than widening the view, which would also
    // drop drafts onto the Home carousel.
    supabase
      .from('trips')
      .select('id,slug,title,countries,start_date,status')
      .then(({ data }) => alive && setDrafts((data ?? []).filter((t) => t.status !== 'confirmed')))
    return () => {
      alive = false
    }
    // Keyed on the signed-in id as well as the reload counter: restoring a
    // session is asynchronous, and a read that goes out before the token
    // exists is answered as an anonymous one. Without this the tab loads
    // empty on a cold start and never tries again.
  }, [reloads, user?.id])

  if (reviewing)
    return <FlightTriage onClose={() => setReviewing(false)} onChanged={() => setReloads((n) => n + 1)} />
  if (error) return <div className="error-note">flights: {error}</div>
  if (!flights) return <div className="tab-loading">loading flights…</div>

  // Confirmed trips keep their curated sort_order; drafts (which is where
  // upcoming flights live) go first, soonest departure at the top, since an
  // itinerary you're about to fly matters more than one you already have.
  const tripsById = new Map([...drafts, ...tripMeta].map((t) => [t.id, t]))
  const draftOrder = [...drafts]
    .sort((a, b) => (a.start_date || '9999').localeCompare(b.start_date || '9999'))
    .map((t) => t.id)
  const order = [...draftOrder, ...tripMeta.map((t) => t.id)].filter(
    (id) => !selectedTrip || tripsById.get(id)?.slug === selectedTrip
  )

  const byTrip = new Map()
  for (const f of flights) {
    if (selectedTrip && tripsById.get(f.trip_id)?.slug !== selectedTrip) continue
    if (!byTrip.has(f.trip_id)) byTrip.set(f.trip_id, [])
    byTrip.get(f.trip_id).push(f)
  }

  // Imported history — seventeen years of byAir logs — carries no trip: the
  // trips it belongs to were never written down, and inventing four hundred
  // of them would bury the fourteen that are real. They still belong on
  // screen, newest first, under their own heading below the trips.
  const loose = selectedTrip ? [] : (byTrip.get(null) ?? [])
  byTrip.delete(null)

  const historyByYear = new Map()
  for (const f of loose) {
    const year = (f.dep_time || '').slice(0, 4) || '—'
    if (!historyByYear.has(year)) historyByYear.set(year, [])
    historyByYear.get(year).unshift(f) // flights arrive ascending; show newest first
  }
  const historyYears = [...historyByYear.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  // Not "how many are unattributed" — an imported flight is yours until
  // something says otherwise, so the number worth showing is how many the
  // app can *prove* it doesn't know: the ones that overlap another flight
  // or depart from an airport the previous one didn't land at.
  const openQuestions = myEmail
    ? new Set(
        findConflicts(flights, myEmail)
          .filter((c) => c.kind !== 'gap')
          .flatMap((c) => [c.a.id, c.b.id])
      ).size
    : 0
  const defaultOpen = historyYears.length ? [historyYears[0][0]] : []
  const isYearOpen = (year) => (openYears ?? new Set(defaultOpen)).has(year)
  const toggleYear = (year) =>
    setOpenYears((prev) => {
      const next = new Set(prev ?? defaultOpen)
      next.has(year) ? next.delete(year) : next.add(year)
      return next
    })

  const plannedByTrip = new Map()
  for (const p of planned) {
    if (selectedTrip && tripsById.get(p.trip_id)?.slug !== selectedTrip) continue
    if (!plannedByTrip.has(p.trip_id)) plannedByTrip.set(p.trip_id, [])
    plannedByTrip.get(p.trip_id).push(p)
  }

  // The route strip wants lat/lon pairs; planned legs carry only airport
  // codes, so borrow coordinates from the lookup table and drop any leg
  // whose airport isn't known rather than drawing it somewhere wrong.
  const stripShape = (p) => {
    const d = p.detail || {}
    const from = AIRPORT_COORDS[d.dep_airport]
    const to = AIRPORT_COORDS[d.arr_airport]
    if (!from || !to) return null
    return {
      id: p.id,
      dep_airport: d.dep_airport,
      arr_airport: d.arr_airport,
      dep_lat: from[0], dep_lon: from[1],
      arr_lat: to[0], arr_lon: to[1],
      airline: d.airline,
      flight_number: d.flight_number,
      dep_time: p.event_date,
    }
  }

  const sections = order.filter((id) => byTrip.has(id) || plannedByTrip.has(id))

  // Lifetime totals across everything flown, trip or not. Laps of the earth
  // because 2.7 million kilometres is a number nobody has a feel for, and
  // "sixty-eight times round" is.
  const EARTH_KM = 40075
  const lifetimeKm = flights.reduce((s, f) => s + (f.distance_km || 0), 0)
  const lifetimeAirports = new Set(flights.flatMap((f) => [f.dep_airport, f.arr_airport])).size
  const firstYear = flights.length ? flights[0].dep_time?.slice(0, 4) : null

  if (!sections.length && !loose.length) {
    return (
      <div className="placeholder">
        <div className="placeholder-code">flights</div>
        <div className="placeholder-note">
          {selectedTrip ? 'No flights logged for this trip yet.' : 'No flights yet.'}
        </div>
      </div>
    )
  }

  return (
    <div className="flights-tab">
      {!selectedTrip && flights.length > 0 && (
        <div className="flights-lifetime">
          <div className="fl-stat">
            <span className="fl-value">{flights.length.toLocaleString()}</span>
            <span className="fl-label">flights{firstYear ? ` since ${firstYear}` : ''}</span>
          </div>
          <div className="fl-stat">
            <span className="fl-value">{lifetimeKm.toLocaleString()}</span>
            <span className="fl-label">kilometres</span>
          </div>
          <div className="fl-stat">
            <span className="fl-value">{(lifetimeKm / EARTH_KM).toFixed(1)}×</span>
            <span className="fl-label">round the earth</span>
          </div>
          <div className="fl-stat">
            <span className="fl-value">{lifetimeAirports}</span>
            <span className="fl-label">airports</span>
          </div>
        </div>
      )}
      {openQuestions > 0 && (
        <button className="flights-review-cta" onClick={() => setReviewing(true)}>
          <span className="frc-count">{openQuestions.toLocaleString()}</span>
          <span className="frc-text">
            flights can't all be yours — you'd be in two places at once. Sort them out →
          </span>
        </button>
      )}
      {sections.map((tripId) => {
        const trip = tripsById.get(tripId)
        const list = byTrip.get(tripId) ?? []
        const upcoming = plannedByTrip.get(tripId) ?? []
        const km = list.reduce((s, f) => s + (f.distance_km || 0), 0)
        const color = tripColor(trip?.slug)
        const total = list.length + upcoming.length
        const strip = [...list, ...upcoming.map(stripShape).filter(Boolean)]
        return (
          <section key={tripId} className="flight-section" style={{ '--fsh-accent': color }}>
            <div className="flight-section-head">
              <span className="fsh-accent-dot" />
              <span className="fsh-title trip-flags-inline">
                <CountryFlags countries={trip?.countries} size={15} /> {trip?.title}
              </span>
              <span className="fsh-meta">
                {total} {total === 1 ? 'flight' : 'flights'}
                {km > 0 ? ` · ${km.toLocaleString()} km` : ''}
                {upcoming.length ? ` · ${upcoming.length} upcoming` : ''}
              </span>
            </div>
            <RouteStrip
              flights={strip}
              color={color}
              showing={showing[tripId] ?? null}
              onPick={(i) => {
                // Tapping a dot opens the flight that leaves from it, which
                // is the same gesture in the other direction.
                const found = [...stripOf(strip).legs].find(([, [from]]) => from === i)
                if (found) setShowing((m) => ({ ...m, [tripId]: found[0] }))
              }}
            />
            {list.map((f) => (
              <FlightCard
                key={f.id}
                flight={f}
                aircraftType={f.aircraft_types}
                onOpen={(id) => setShowing((m) => ({ ...m, [tripId]: id }))}
              />
            ))}
            {/* Planner's own card, reused verbatim — it already renders a
                planned_event as the same departures-board strip, and it
                knows not to offer the edit/photo affordances that assume a
                row in the flights table. */}
            {upcoming.map((p) => (
              <PlanFlightCard key={p.id} event={p} onEditEvent={() => {}} onSaveDetail={async () => {}} />
            ))}
          </section>
        )
      })}

      {/* Grouped by year and collapsed by default: nine hundred cards is a
          scroll no-one finishes, but "2019 · 61 flights · 214,000 km" is a
          line you can read. The newest year opens on arrival so the section
          isn't just a wall of closed drawers. */}
      {historyYears.length > 0 && (
        <div className="flights-history-rule">
          Flight history · {loose.length.toLocaleString()} legs
        </div>
      )}
      {historyYears.map(([year, list]) => {
        const open = isYearOpen(year)
        const km = list.reduce((s, f) => s + (f.distance_km || 0), 0)
        return (
          <section key={year} className="flight-section flight-section-history">
            <button
              type="button"
              className="flight-section-head fsh-toggle"
              aria-expanded={open}
              onClick={() => toggleYear(year)}
            >
              <span className="fsh-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
              <span className="fsh-title">{year}</span>
              <span className="fsh-meta">
                {list.length} {list.length === 1 ? 'flight' : 'flights'} · {km.toLocaleString()} km
              </span>
            </button>
            {open &&
              list.map((f) => <FlightCard key={f.id} flight={f} aircraftType={f.aircraft_types} />)}
          </section>
        )
      })}
    </div>
  )
}
