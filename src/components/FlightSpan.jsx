import FlapText from './FlapText.jsx'
import { saidAs } from '../lib/flightSpan.js'

// The head of a flight card: two ends and the line between them.
//
// It existed twice, and only one of them was ever rebuilt.
//
// FlightCard renders a row from the flights table — a flight that has been
// taken. PlanFlightCard renders a planned_event of kind 'flight' — one that
// has not. #22 rebuilt the first into a span, with both ends, the duration
// through the middle and the day shift on a red-eye. The second kept the old
// head: a departure time, an arrow, a flight number.
//
// Which is the wrong way round for the person it matters to. Every upcoming
// flight in the database is a planned_event — measured: 8 trips carry rows in
// `flights` and every one of them has already happened, while the two trips
// still to come carry 8 planned flights and no rows at all. So the card built
// to say when you land, how long you are in the air and which gate to stand
// at was unreachable from any flight anybody was about to take, and the
// rebuild was reported as missing. It was not missing; it was on the other
// component.
//
// One span, used by both. Everything either card knows how to say beyond the
// span — how it went, where it is now, the photographs taken on it, the
// planner's editable detail — stays where it was.

/**
 * @param dep/arr  { code, city, time, at } — `at` is the gate/terminal line,
 *                 absent until there is one to show.
 * @param minutes  time in the air, or null when either end is unknown
 * @param shift    whole days between the local dates, for a red-eye
 * @param flying   { part } while airborne, null otherwise — the line fills
 *                 and the mark rides it
 */
export default function FlightSpan({ dep, arr, number, minutes, shift = 0, flying = null }) {
  return (
    <span className="fh-span">
      <span className="fh-end">
        <FlapText className="fh-time" text={dep.time} groupDelay={0} />
        <FlapText className="fh-code" text={dep.code} groupDelay={200} />
        <span className="fh-place">{dep.city}</span>
        {dep.at && <span className="fh-gate">{dep.at}</span>}
      </span>

      <span className="fh-mid">
        {minutes ? <span className="fh-dur">{saidAs(minutes)}</span> : null}
        {/* In the air, the line fills and the mark rides it. On the ground it
            is the plain rule it always was. */}
        <span className={`fh-line${flying ? ' flying' : ''}`} aria-hidden="true">
          {flying && <i className="fh-line-flown" style={{ width: `${Math.round(flying.part * 100)}%` }} />}
          <i
            className="fh-line-plane"
            style={flying ? { right: 'auto', left: `${Math.round(flying.part * 100)}%` } : undefined}
          />
        </span>
        <FlapText className="fh-flightno" text={number || ''} groupDelay={420} />
      </span>

      <span className="fh-end fh-end--to">
        <span className="fh-time-wrap">
          <FlapText className="fh-time" text={arr.time} groupDelay={320} />
          {/* Leaving at 23:55 and landing at 06:10 reads as arriving before
              you left without this. */}
          {shift !== 0 && (
            <sup className="fh-next">
              {shift > 0 ? '+' : '−'}
              {Math.abs(shift)}
            </sup>
          )}
        </span>
        <FlapText className="fh-code" text={arr.code} groupDelay={260} />
        <span className="fh-place">{arr.city}</span>
        {arr.at && <span className="fh-gate">{arr.at}</span>}
      </span>
    </span>
  )
}
