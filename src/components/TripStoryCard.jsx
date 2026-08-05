import { useState } from 'react'
import CountryFlags from './CountryFlags.jsx'
import Icon from './Icon.jsx'
import TripRecap from './TripRecap.jsx'
import { tripPhase } from '../lib/tripPhase.js'
import { coverUrl } from '../lib/imgTransform.js'

// Polarsteps/FindPenguins-style: tapping a trip on the globe shouldn't
// dead-end at a spin — it unfolds into the trip's story. This card rises
// over the lower globe (which stays flown-to the trip), showing the cover,
// dates, an at-a-glance count, and — the point — direct jumps INTO the
// trip: its journal, photos, flights, map. No more hunting the bottom nav.
// Rendered as a button only when it does something. A <button> wrapper on
// a trip you can't look back on is a lie to anyone using a screen reader.
function HeadContent({ as: Tag = 'div', children, ...rest }) {
  return <Tag {...rest}>{children}</Tag>
}

function fmtRange(t) {
  if (!t.start_date) return 'dates tbc'
  const opt = { day: 'numeric', month: 'short', year: 'numeric' }
  const a = new Date(t.start_date).toLocaleDateString('en-GB', opt)
  const b = t.end_date ? new Date(t.end_date).toLocaleDateString('en-GB', opt) : null
  return b ? `${a} – ${b}` : a
}

export default function TripStoryCard({ trip, cover, onClose, goToTab }) {
  const [recapOpen, setRecapOpen] = useState(false)
  if (!trip) return null

  // Only a finished trip has anything to look back on.
  const isPast = tripPhase(trip) === 'past'

  // Only offer jumps that actually lead somewhere for this trip. Map is
  // always worthwhile once a trip is selected; the rest gate on content.
  const jumps = [
    trip.journal_count > 0 && { tab: 'journal', icon: 'book', label: 'Journal', sub: `${trip.journal_count} ${trip.journal_count === 1 ? 'entry' : 'entries'}` },
    { tab: 'photos', icon: 'photo', label: 'Photos', sub: 'gallery' },
    { tab: 'map', icon: 'map', label: 'Map', sub: trip.run_count > 0 ? `${trip.run_count} runs` : 'route' },
    trip.flight_count > 0 && { tab: 'flights', icon: 'plane', label: 'Flights', sub: `${trip.flight_count} ${trip.flight_count === 1 ? 'flight' : 'flights'}` },
  ].filter(Boolean)

  return (
    <div className="story-card">
      <button className="story-close" onClick={onClose} aria-label="Back to the globe">
        <Icon name="close" size={13} />
      </button>

      {/* On a finished trip the header IS the recap — tap the cover, the
          way you would a memory in Photos. Nothing to label, nothing extra
          on the card. An unfinished trip keeps the same block as plain
          text, because there's nothing to look back on yet. */}
      <HeadContent
        as={isPast ? 'button' : 'div'}
        className={`story-head${isPast ? ' openable' : ''}`}
        onClick={isPast ? () => setRecapOpen(true) : undefined}
      >
        {cover && (
          <span className="story-thumb">
            <img src={coverUrl(cover, { width: 220, height: 220 })} alt="" />
            {isPast && <span className="story-thumb-mark">In one page</span>}
          </span>
        )}
        <span className="story-headtext">
          <span className="story-flags">
            <CountryFlags countries={trip.countries} size={17} />
          </span>
          <span className="story-title">{trip.title}</span>
          <span className="story-dates">{fmtRange(trip)}</span>
        </span>
        {isPast && <Icon name="chevron" size={17} className="story-head-go" />}
      </HeadContent>

      <div className="story-jumps">
        {jumps.map((j) => (
          <button key={j.tab} className="story-jump" onClick={() => goToTab(j.tab)}>
            <Icon name={j.icon} size={19} className="story-jump-i" />
            <span className="story-jump-label">{j.label}</span>
            <span className="story-jump-sub">{j.sub}</span>
          </button>
        ))}
      </div>

      {recapOpen && <TripRecap trip={trip} cover={cover} onClose={() => setRecapOpen(false)} />}
    </div>
  )
}
