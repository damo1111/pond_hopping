import CountryFlags from './CountryFlags.jsx'
import { coverUrl } from '../lib/imgTransform.js'

// Polarsteps/FindPenguins-style: tapping a trip on the globe shouldn't
// dead-end at a spin — it unfolds into the trip's story. This card rises
// over the lower globe (which stays flown-to the trip), showing the cover,
// dates, an at-a-glance count, and — the point — direct jumps INTO the
// trip: its journal, photos, flights, map. No more hunting the bottom nav.
function fmtRange(t) {
  if (!t.start_date) return 'dates tbc'
  const opt = { day: 'numeric', month: 'short', year: 'numeric' }
  const a = new Date(t.start_date).toLocaleDateString('en-GB', opt)
  const b = t.end_date ? new Date(t.end_date).toLocaleDateString('en-GB', opt) : null
  return b ? `${a} – ${b}` : a
}

export default function TripStoryCard({ trip, cover, onClose, goToTab }) {
  if (!trip) return null

  // Only offer jumps that actually lead somewhere for this trip. Map is
  // always worthwhile once a trip is selected; the rest gate on content.
  const jumps = [
    trip.journal_count > 0 && { tab: 'journal', icon: '📔', label: 'Journal', sub: `${trip.journal_count} ${trip.journal_count === 1 ? 'entry' : 'entries'}` },
    { tab: 'photos', icon: '📷', label: 'Photos', sub: 'gallery' },
    { tab: 'map', icon: '🗺️', label: 'Map', sub: trip.run_count > 0 ? `${trip.run_count} runs` : 'route' },
    trip.flight_count > 0 && { tab: 'flights', icon: '✈️', label: 'Flights', sub: `${trip.flight_count} ${trip.flight_count === 1 ? 'flight' : 'flights'}` },
  ].filter(Boolean)

  return (
    <div className="story-card">
      <button className="story-close" onClick={onClose} aria-label="Back to the globe">
        ✕
      </button>

      <div className="story-head">
        {cover && (
          <span className="story-thumb">
            <img src={coverUrl(cover, { width: 220, height: 220 })} alt="" />
          </span>
        )}
        <span className="story-headtext">
          <span className="story-flags">
            <CountryFlags countries={trip.countries} size={17} />
          </span>
          <span className="story-title">{trip.title}</span>
          <span className="story-dates">{fmtRange(trip)}</span>
        </span>
      </div>

      <div className="story-jumps">
        {jumps.map((j) => (
          <button key={j.tab} className="story-jump" onClick={() => goToTab(j.tab)}>
            <span className="story-jump-i">{j.icon}</span>
            <span className="story-jump-label">{j.label}</span>
            <span className="story-jump-sub">{j.sub}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
