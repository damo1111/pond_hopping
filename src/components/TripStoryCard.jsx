import { useState } from 'react'
import CountryFlags from './CountryFlags.jsx'
import Icon from './Icon.jsx'
import TripRecap from './TripRecap.jsx'
import { tripPhase } from '../lib/tripPhase.js'
import { coverUrl } from '../lib/imgTransform.js'

// Tapping a trip on the globe shouldn't dead-end at a spin — the card
// rises over the flown-to globe and takes you into the trip. It used to
// offer four signpost tiles (journal, photos, map, flights); those are
// gone. See the note in the component for why.

function fmtRange(t) {
  if (!t.start_date) return 'dates tbc'
  const opt = { day: 'numeric', month: 'short', year: 'numeric' }
  const a = new Date(t.start_date).toLocaleDateString('en-GB', opt)
  const b = t.end_date ? new Date(t.end_date).toLocaleDateString('en-GB', opt) : null
  return b ? `${a} – ${b}` : a
}

export default function TripStoryCard({ trip, cover, onClose, openPlanner }) {
  const [recapOpen, setRecapOpen] = useState(false)
  if (!trip) return null

  // One card, one destination, decided by where the trip is in its life. A
  // finished trip opens its recap — and the recap's own figures are the way
  // through to the journal, photos, map and flights, so the four signpost
  // tiles that used to sit here were saying the same thing twice and
  // colliding with the bottom nav while they did it.
  //
  // Anything not yet finished opens its planner instead: there's nothing to
  // look back on, and the itinerary is what you actually came for.
  const isPast = tripPhase(trip) === 'past'

  return (
    <div className="story-card">
      <button className="story-close" onClick={onClose} aria-label="Back to the globe">
        <Icon name="close" size={13} />
      </button>

      <button
        className="story-head openable"
        onClick={isPast ? () => setRecapOpen(true) : () => openPlanner?.(trip.id)}
      >
        {cover && (
          <span className="story-thumb">
            <img src={coverUrl(cover, { width: 220, height: 220 })} alt="" />
            <span className="story-thumb-mark">{isPast ? 'In one page' : 'Plan it'}</span>
          </span>
        )}
        <span className="story-headtext">
          <span className="story-flags">
            <CountryFlags countries={trip.countries} size={17} />
          </span>
          <span className="story-title">{trip.title}</span>
          <span className="story-dates">{fmtRange(trip)}</span>
        </span>
        <Icon name="chevron" size={17} className="story-head-go" />
      </button>

      {recapOpen && (
        <TripRecap
          trip={trip}
          cover={cover}
          onClose={() => setRecapOpen(false)}
        />
      )}
    </div>
  )
}
