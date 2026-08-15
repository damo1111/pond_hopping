import CountryFlags from '../CountryFlags.jsx'
import Icon from '../Icon.jsx'
import { shouldBadge } from '../../lib/demoTour.js'
import { coverUrl, thumb } from '../../lib/imgTransform.js'

// One card language for the whole lane, because Someday, Planning and Booked
// are one spectrum rather than three screens. What changes between them is
// what the card can honestly say — a wish has a name and a photo, a booked
// trip has a departure date to count down to.

function Meters({ readiness }) {
  if (!readiness?.length) return null
  return (
    <div className="pc-meters">
      {readiness.map((m) => (
        <span className={`pc-meter${m.have ? ' on' : ''}${m.short ? ' short' : ''}`} key={m.key}>
          <strong>{m.of ? `${m.have}/${m.of}` : m.have}</strong> {m.label}
        </span>
      ))}
    </div>
  )
}

/**
 * What is still missing, said as a sentence.
 *
 * The counters above say what exists. This says what does not, which is the
 * only question a planning card is actually asked — and it is the line the
 * concierge would open with, so it doubles as the reason to tap.
 *
 * Nothing invented: nights come from the trip's own dates, an unslept night
 * is one no hotel covers, an empty day is one with no event on it. Returns
 * null when there is genuinely nothing to say, because a card that
 * manufactures a worry is worse than a quiet one.
 */
function stillMissing({ unbooked = 0, empty = [], readiness = [] }) {
  const bits = []
  if (unbooked > 0) {
    bits.push(`${unbooked} night${unbooked === 1 ? '' : 's'} with nowhere to sleep`)
  }
  if (empty.length) {
    const names = empty
      .slice(0, 2)
      .map((iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' }))
    const more = empty.length - names.length
    bits.push(
      `${names.join(' and ')}${more > 0 ? ` and ${more} more` : ''} still empty`
    )
  }
  if (!bits.length) {
    const flights = readiness.find((m) => m.key === 'flights')
    if (flights && !flights.have) bits.push('no way of getting there yet')
  }
  if (!bits.length) return null
  // Sentence case, one line, no full stop — it sits under a title, not in a
  // paragraph.
  return bits.join(' · ')
}

export default function PlanCard({ row, cover, whose, index = 0, onOpen }) {
  const { kind, stage, title, trip, wish, countdown } = row
  const image = kind === 'wish' ? wish.image_url : cover
  // The globe says which trips are examples and this screen did not, so the
  // demo trip read as somebody's actual upcoming holiday — with a countdown
  // on it, which is the most convincing thing a card can have.
  const example = kind === 'trip' && shouldBadge(trip)
  const missing = kind === 'trip' ? stillMissing(row) : null

  return (
    <button
      className={`plan-card pc-${stage}${example ? ' plan-card--demo' : ''}`}
      onClick={onOpen}
      /* Staggered like the recap's figures: the lane assembles rather than
         appearing, which is the same language the rest of the app now uses. */
      style={{ animationDelay: `${60 + index * 55}ms` }}
    >
      {image ? (
        <img
          className="pc-img"
          src={kind === 'wish' ? thumb(image, { width: 320, height: 320 }) : coverUrl(image, { width: 320, height: 320 })}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <span className="pc-img pc-img-none" aria-hidden="true">
          <Icon name="globe" size={22} />
        </span>
      )}

      <span className="pc-body">
        {/* Anticipation is the emotional core of a planning screen, so the
            countdown is the loudest thing on the card — not a fraction of
            items ticked off. */}
        <span className={`pc-when${countdown.soon ? ' soon' : ''}`}>{countdown.text}</span>
        <span className="pc-title">
          {trip?.countries?.length > 0 && <CountryFlags countries={trip.countries} size={14} />}
          {title}
        </span>
        {whose && <span className="pc-whose">{whose}</span>}
        {kind === 'wish' && wish.notes && <span className="pc-note">{wish.notes}</span>}
        {kind === 'trip' && <Meters readiness={row.readiness} />}
        {/* The card grows only when it has this to say. A trip with nothing
            missing stays exactly as short as it was. */}
        {kind === 'trip' && missing && <span className="pc-missing">{missing}</span>}
      </span>

      {example && <span className="pc-sash">Example</span>}

      <span className="pc-go" aria-hidden="true">
        <Icon name="chevron" size={15} />
      </span>
    </button>
  )
}
