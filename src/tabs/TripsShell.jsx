import { useContext } from 'react'
import { TripContext } from '../App.jsx'

/**
 * Session 1 stub for the Trips tab: a plain list straight from trip_meta,
 * proving the Supabase wiring. Session 4 replaces this with the card grid.
 */

function formatDates(trip) {
  if (!trip.start_date) return 'dates tbc'
  const opts = { month: 'short', year: 'numeric' }
  const start = new Date(trip.start_date).toLocaleDateString('en-AU', opts)
  if (!trip.end_date) return start
  const end = new Date(trip.end_date).toLocaleDateString('en-AU', opts)
  return start === end ? start : `${start} — ${end}`
}

export default function TripsShell() {
  const { tripMeta, selectedTrip, setSelectedTrip } = useContext(TripContext)

  if (!tripMeta.length) {
    return (
      <div className="placeholder">
        <div className="placeholder-code">trips</div>
        <div className="placeholder-note">No trips yet — run the schema + seed in Supabase.</div>
      </div>
    )
  }

  return (
    <div className="trip-list">
      {tripMeta.map((trip) => (
        <div
          key={trip.slug}
          className="trip-row"
          onClick={() => setSelectedTrip(selectedTrip === trip.slug ? null : trip.slug)}
          style={selectedTrip === trip.slug ? { borderColor: 'var(--accent-dim)' } : undefined}
        >
          <div className="trip-row-title">
            {trip.countries?.join(' ')} {trip.title}
          </div>
          <div className="trip-row-meta">
            {formatDates(trip)} · {trip.flight_count ?? 0} flights · {trip.run_count ?? 0} runs
            {selectedTrip === trip.slug && <> · <span className="pill">selected</span></>}
          </div>
        </div>
      ))}
    </div>
  )
}
