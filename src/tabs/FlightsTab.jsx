import { useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import FlightCard from '../components/FlightCard.jsx'
import RouteStrip from '../components/RouteStrip.jsx'
import { tripColor } from '../lib/tripColors.js'
import CountryFlags from '../components/CountryFlags.jsx'

export default function FlightsTab() {
  const { tripMeta, selectedTrip } = useContext(TripContext)
  const [flights, setFlights] = useState(null)
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
    return () => {
      alive = false
    }
  }, [])

  if (error) return <div className="error-note">flights: {error}</div>
  if (!flights) return <div className="tab-loading">loading flights…</div>

  // Trip order comes from tripMeta (sorted); filter to selectedTrip if set.
  const tripsById = new Map(tripMeta.map((t) => [t.id, t]))
  const order = tripMeta
    .filter((t) => !selectedTrip || t.slug === selectedTrip)
    .map((t) => t.id)

  const byTrip = new Map()
  for (const f of flights) {
    if (selectedTrip && tripsById.get(f.trip_id)?.slug !== selectedTrip) continue
    if (!byTrip.has(f.trip_id)) byTrip.set(f.trip_id, [])
    byTrip.get(f.trip_id).push(f)
  }

  const sections = order.filter((id) => byTrip.has(id))

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
        const list = byTrip.get(tripId)
        const km = list.reduce((s, f) => s + (f.distance_km || 0), 0)
        const color = tripColor(trip?.slug)
        return (
          <section key={tripId} className="flight-section" style={{ '--fsh-accent': color }}>
            <div className="flight-section-head">
              <span className="fsh-accent-dot" />
              <span className="fsh-title trip-flags-inline">
                <CountryFlags countries={trip?.countries} size={15} /> {trip?.title}
              </span>
              <span className="fsh-meta">
                {list.length} {list.length === 1 ? 'flight' : 'flights'} · {km.toLocaleString()} km
              </span>
            </div>
            <RouteStrip flights={list} color={color} />
            {list.map((f) => (
              <FlightCard key={f.id} flight={f} aircraftType={f.aircraft_types} />
            ))}
          </section>
        )
      })}
    </div>
  )
}
