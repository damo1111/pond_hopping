import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet'
import { supabase } from './lib/supabase.js'
import { greatCircle } from './lib/geo.js'
import { localDate } from './lib/airportTz.js'
import CountryFlags from './components/CountryFlags.jsx'

const fmtD = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const fmtA = (n) => 'A$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })

// Public read-only trip page, rendered when ?share=<slug> is present.
export default function ShareView({ slug, show }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: trips } = await supabase.from('trips').select('*').eq('slug', slug).limit(1)
      const trip = trips?.[0]
      if (!trip) {
        if (alive) setData({ missing: true })
        return
      }
      const [j, f, r, p, c] = await Promise.all([
        show.includes('journal')
          ? supabase.from('journal_entries').select('*').eq('trip_id', trip.id).order('entry_date')
          : { data: [] },
        show.includes('flights')
          ? supabase.from('flights').select('*').eq('trip_id', trip.id).order('dep_time')
          : { data: [] },
        show.includes('map') ? supabase.from('runs').select('*').eq('trip_id', trip.id) : { data: [] },
        show.includes('map') ? supabase.from('map_pins').select('*').eq('trip_id', trip.id) : { data: [] },
        show.includes('costs') ? supabase.from('costs').select('*').eq('trip_id', trip.id) : { data: [] },
      ])
      if (alive)
        setData({ trip, journal: j.data ?? [], flights: f.data ?? [], runs: r.data ?? [], pins: p.data ?? [], costs: c.data ?? [] })
    })()
    return () => {
      alive = false
    }
  }, [slug, show])

  if (!data) return <div className="tab-loading" style={{ paddingTop: 80 }}>loading…</div>
  if (data.missing)
    return <div className="tab-loading" style={{ paddingTop: 80 }}>trip not found</div>

  const { trip, journal, flights, runs, pins, costs } = data
  const mapPts = [
    ...runs.flatMap((r) => [r.coords[0], r.coords[r.coords.length - 1]]),
    ...pins.map((p) => [p.lat, p.lon]),
    ...flights.filter((f) => f.dep_lat != null).flatMap((f) => [[f.dep_lat, f.dep_lon], [f.arr_lat, f.arr_lon]]),
  ]
  const totalCost = costs.reduce((s, c) => s + Number(c.amount_aud || 0), 0)

  return (
    <div className="share-view">
      <header className="share-head">
        <img src="/duck.png" alt="" className="header-duck" />
        <div>
          <div className="app-title">POND HOPPING</div>
          <div className="app-subtitle">shared trip · read only</div>
        </div>
      </header>

      <div className="share-hero">
        <div className="trip-flags">
          <CountryFlags countries={trip.countries} size={26} />
        </div>
        <h1 className="share-title">{trip.title}</h1>
        {trip.subtitle && <div className="trip-card-sub">{trip.subtitle}</div>}
        {trip.start_date && (
          <div className="trip-card-dates">
            {fmtD(trip.start_date)}
            {trip.end_date ? ` – ${fmtD(trip.end_date)}` : ''} {new Date(trip.start_date).getFullYear()}
          </div>
        )}
      </div>

      {show.includes('map') && mapPts.length > 0 && (
        <div className="share-map">
          <MapContainer
            bounds={mapPts}
            boundsOptions={{ padding: [28, 28] }}
            zoomControl={false}
            attributionControl={false}
            style={{ height: '100%', width: '100%', background: '#EDE9DF' }}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            {flights
              .filter((f) => f.dep_lat != null)
              .map((f) => (
                <Polyline
                  key={f.id}
                  positions={greatCircle([f.dep_lat, f.dep_lon], [f.arr_lat, f.arr_lon], 72)}
                  pathOptions={{ color: '#A8842C', weight: 2, dashArray: '5 7', opacity: 0.85 }}
                />
              ))}
            {runs.map((r) => (
              <Polyline key={r.id} positions={r.coords} pathOptions={{ color: r.color || '#3E7D54', weight: 3, opacity: 0.85 }} />
            ))}
            {pins.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lon]}
                radius={5}
                pathOptions={{ color: '#fff', fillColor: '#A8842C', fillOpacity: 0.95, weight: 1.5 }}
              />
            ))}
          </MapContainer>
        </div>
      )}

      {show.includes('flights') && flights.length > 0 && (
        <section className="share-section">
          <div className="flight-section-head">
            <span className="fsh-title">Itinerary</span>
            <span className="fsh-meta">{flights.length} flights</span>
          </div>
          {flights.map((f) => (
            <div key={f.id} className="share-flight">
              <span className="share-flight-route">
                {f.dep_airport} → {f.arr_airport}
              </span>
              <span className="share-flight-meta">
                {f.flight_number} · {f.dep_time ? localDate(f.dep_time, f.dep_airport) : ''}
              </span>
            </div>
          ))}
        </section>
      )}

      {show.includes('journal') && journal.length > 0 && (
        <section className="share-section">
          <div className="flight-section-head">
            <span className="fsh-title">Diary</span>
            <span className="fsh-meta">{journal.length} days</span>
          </div>
          {journal.map((e) => (
            <div key={e.id} className="journal-entry" style={{ cursor: 'default' }}>
              <div className="je-top">
                <span className="je-mood">{e.mood}</span>
                <span className="je-day">{e.day_number ? `DAY ${e.day_number}` : ''}</span>
                <span className="je-date">{fmtD(e.entry_date)}</span>
                <span className="je-city">{e.city}</span>
              </div>
              <div className="je-title">{e.title}</div>
              <div className="je-note">{e.note}</div>
            </div>
          ))}
        </section>
      )}

      {show.includes('costs') && costs.length > 0 && (
        <section className="share-section">
          <div className="flight-section-head">
            <span className="fsh-title">Costs</span>
            <span className="fsh-meta">{fmtA(totalCost)} total</span>
          </div>
        </section>
      )}

      <footer className="share-foot">made with pond hopping 🦆</footer>
    </div>
  )
}
