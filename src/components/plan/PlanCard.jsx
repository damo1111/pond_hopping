import CountryFlags from '../CountryFlags.jsx'
import Icon from '../Icon.jsx'
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
        <span className={`pc-meter${m.have ? ' on' : ''}`} key={m.key}>
          <strong>{m.have}</strong> {m.label}
        </span>
      ))}
    </div>
  )
}

export default function PlanCard({ row, cover, whose, index = 0, onOpen }) {
  const { kind, stage, title, trip, wish, countdown } = row
  const image = kind === 'wish' ? wish.image_url : cover

  return (
    <button
      className={`plan-card pc-${stage}`}
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
      </span>

      <span className="pc-go" aria-hidden="true">
        <Icon name="chevron" size={15} />
      </span>
    </button>
  )
}
