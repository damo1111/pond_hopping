import { fmtTime } from '../../lib/planItems.js'

// Upcoming-flight card in the spirit of Flighty / ByAir: airline + number,
// a status pill, big origin→destination with local times, and a subtle
// route progress line. Reads from a planned_events row of kind 'flight'
// whose `detail` blob carries the flight specifics.
const STATUS = {
  scheduled: { label: 'Scheduled', cls: 'scheduled' },
  on_time: { label: 'On time', cls: 'ontime' },
  delayed: { label: 'Delayed', cls: 'delayed' },
  boarding: { label: 'Boarding', cls: 'ontime' },
  landed: { label: 'Landed', cls: 'muted' },
  cancelled: { label: 'Cancelled', cls: 'delayed' },
  unbooked: { label: 'Not booked yet', cls: 'muted' },
}

export default function PlanFlightCard({ event, onEdit }) {
  const d = event.detail || {}
  const status = STATUS[d.status] || STATUS.scheduled
  const dep = d.dep_airport || '—'
  const arr = d.arr_airport || '—'

  return (
    <button className="pf-card" onClick={onEdit}>
      <div className="pf-top">
        <span className="pf-airline">
          <span className="pf-plane">✈</span>
          {d.airline || 'Flight'}
          {d.flight_number ? <span className="pf-fno">{d.flight_number}</span> : null}
        </span>
        <span className={`pf-status pf-status-${status.cls}`}>{status.label}</span>
      </div>

      <div className="pf-route">
        <div className="pf-endpoint">
          <div className="pf-code">{dep}</div>
          <div className="pf-city">{d.dep_city || ''}</div>
          <div className="pf-time">{fmtTime(event.start_time)}</div>
        </div>

        <div className="pf-path">
          <span className="pf-dot" />
          <span className="pf-line" />
          <span className="pf-planemid">✈</span>
          <span className="pf-line" />
          <span className="pf-dot pf-dot-hollow" />
        </div>

        <div className="pf-endpoint pf-endpoint-arr">
          <div className="pf-code">{arr}</div>
          <div className="pf-city">{d.arr_city || ''}</div>
          <div className="pf-time">{fmtTime(event.end_time)}</div>
        </div>
      </div>

      {(d.via || event.end_date) && (
        <div className="pf-foot">
          {d.via ? <span>via {d.via}</span> : null}
          {event.end_date && event.end_date !== event.event_date ? <span>arrives next day</span> : null}
        </div>
      )}
    </button>
  )
}
