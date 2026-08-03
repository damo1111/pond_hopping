import { useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import FlightCard from '../components/FlightCard.jsx'
import PlanFlightCard from '../components/planner/PlanFlightCard.jsx'
import RouteStrip from '../components/RouteStrip.jsx'
import { tripColor } from '../lib/tripColors.js'
import CountryFlags from '../components/CountryFlags.jsx'
import { AIRPORT_COORDS } from '../lib/airportCoords.js'

export default function FlightsTab() {
  const { tripMeta, selectedTrip } = useContext(TripContext)
  const [flights, setFlights] = useState(null)
  // Booked-but-not-yet-flown legs live in planned_events, not flights, so
  // an upcoming trip showed an empty Flights tab even with everything
  // booked — Seeby's whole September itinerary, for instance. Same split
  // the globe had. Read both rather than copying rows between them.
  const [planned, setPlanned] = useState([])
  const [drafts, setDrafts] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('flights')
      .select('*, aircraft_types(icao,name,manufacturer)')
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
  }, [])

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

  if (!sections.length) {
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
            <RouteStrip flights={strip} color={color} />
            {list.map((f) => (
              <FlightCard key={f.id} flight={f} aircraftType={f.aircraft_types} />
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
    </div>
  )
}
