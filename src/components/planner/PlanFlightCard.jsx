import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { fetchAircraftPhoto } from '../../lib/planespotters.js'
import TailFin from '../TailFin.jsx'
import FlapText from '../FlapText.jsx'
import { AIRPORT_COORDS } from '../../lib/airportCoords.js'
import { distanceKm } from '../../lib/geo.js'

// Collapsed view reuses the Flights tab's actual departures-board strip
// (.flight-head.board / TailFin / FlapText split-flap animation) rather
// than a bespoke design — this IS the reference the planner should match,
// not just take inspiration from. Tapping expands to terminal/baggage
// belt for both ends, delay likelihood, and aircraft registration (which,
// once set, fetches a real Planespotters photo exactly like Flights does).
const STATUS = {
  scheduled: { label: 'Scheduled', cls: 'scheduled' },
  on_time: { label: 'On time', cls: 'ontime' },
  delayed: { label: 'Delayed', cls: 'delayed' },
  boarding: { label: 'Boarding', cls: 'ontime' },
  landed: { label: 'Landed', cls: 'muted' },
  cancelled: { label: 'Cancelled', cls: 'delayed' },
  unbooked: { label: 'Not booked yet', cls: 'muted' },
}

const DELAY_RISK = [
  { id: 'low', label: 'Low', color: '#3E7D54' },
  { id: 'medium', label: 'Medium', color: '#C17817' },
  { id: 'high', label: 'High', color: '#C0392B' },
]

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Mirrors FlightCard.jsx's Meta component — same interaction, same classes.
// No live flight-tracking source is connected yet (ByAir's connection was
// down when this was checked; TBD which source ends up feeding this), so
// an empty field reads honestly as "TBC" rather than fabricating a value
// or pretending nothing's missing — still tappable to fill in by hand as
// a stopgap.
function DetailCell({ label, value, mono, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!draft.trim()) return
    setSaving(true)
    await onSave(draft.trim())
    setSaving(false)
    setEditing(false)
  }

  if (!value) {
    return editing ? (
      <div className="meta-cell meta-cell-edit" onClick={(e) => e.stopPropagation()}>
        <div className="meta-label">{label}</div>
        <div className="meta-edit-row">
          <input
            className="meta-edit-input"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={label}
          />
          <button className="meta-edit-save" disabled={saving || !draft.trim()} onClick={save}>
            {saving ? '…' : '✓'}
          </button>
        </div>
      </div>
    ) : (
      <button
        className="meta-cell meta-cell-add meta-cell-tbc"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        <div className="meta-label">{label}</div>
        <div className="meta-value meta-add-cta">TBC</div>
      </button>
    )
  }

  return (
    <div className="meta-cell">
      <div className="meta-label">{label}</div>
      <div className={`meta-value${mono ? ' mono' : ''}`}>{value}</div>
    </div>
  )
}

export default function PlanFlightCard({ event, onEditEvent, onSaveDetail }) {
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState(undefined)
  const d = event.detail || {}

  useEffect(() => {
    if (!d.aircraft_reg) {
      setPhoto(null)
      return
    }
    let alive = true
    fetchAircraftPhoto(d.aircraft_reg).then((p) => alive && setPhoto(p))
    return () => {
      alive = false
    }
  }, [d.aircraft_reg])

  async function saveDetail(key, value) {
    const next = { ...d, [key]: value }
    const { error } = await supabase.from('planned_events').update({ detail: next }).eq('id', event.id)
    if (!error) onSaveDetail?.(event.id, next)
  }

  const status = STATUS[d.status] || STATUS.scheduled
  const dep = d.dep_airport || '—'
  const arr = d.arr_airport || '—'
  const km =
    AIRPORT_COORDS[d.dep_airport] && AIRPORT_COORDS[d.arr_airport]
      ? distanceKm(AIRPORT_COORDS[d.dep_airport], AIRPORT_COORDS[d.arr_airport])
      : null

  return (
    <div className={`flight-card pf-card${open ? ' open' : ''}`}>
      <button className="flight-head board" onClick={() => setOpen((o) => !o)}>
        <span className="fh-thumb">
          <TailFin airline={d.airline} size={22} />
          <span className={`pf-status pf-status-${status.cls}`}>{status.label}</span>
        </span>
        <span className="fh-main">
          <span className="fh-row1">
            <FlapText className="fh-time" text={event.start_time || '--:--'} groupDelay={0} />
            <span className="fh-route">
              <FlapText text={dep} groupDelay={200} />
              <span className="fh-arrow">→</span>
              <FlapText text={arr} groupDelay={260} />
            </span>
            <FlapText className="fh-flightno" text={d.flight_number || ''} groupDelay={420} />
          </span>
          <span className="fh-row2">
            {d.dep_city || dep} — {d.arr_city || arr}
            {event.event_date && (
              <>
                <span className="fh-dot">·</span>
                {fmtDate(event.event_date)}
              </>
            )}
            {km && (
              <>
                <span className="fh-dot">·</span>
                {km.toLocaleString()} km
              </>
            )}
          </span>
        </span>
      </button>

      {open && (
        <div className="pf-details" onClick={(e) => e.stopPropagation()}>
          {!d.dep_terminal && !d.arr_terminal && !d.aircraft_reg && (
            <div className="pf-tbc-banner">Live flight tracking isn't connected yet — terminal, gate, baggage belt and aircraft reg show as TBC until then. Tap any field to fill it in yourself for now.</div>
          )}
          {(d.via || (event.end_date && event.end_date !== event.event_date)) && (
            <div className="pf-foot pf-foot-inline">
              {d.via ? <span>via {d.via}</span> : null}
              {event.end_date && event.end_date !== event.event_date ? <span>arrives next day</span> : null}
            </div>
          )}

          <div className="pf-detail-section">
            <div className="pf-detail-title">Departure — {dep}</div>
            <div className="pf-detail-grid">
              <DetailCell label="Terminal" value={d.dep_terminal} onSave={(v) => saveDetail('dep_terminal', v)} />
              <DetailCell label="Gate" value={d.dep_gate} onSave={(v) => saveDetail('dep_gate', v.toUpperCase())} />
            </div>
          </div>

          <div className="pf-detail-section">
            <div className="pf-detail-title">Arrival — {arr}</div>
            <div className="pf-detail-grid">
              <DetailCell label="Terminal" value={d.arr_terminal} onSave={(v) => saveDetail('arr_terminal', v)} />
              <DetailCell label="Baggage belt" value={d.baggage_belt} onSave={(v) => saveDetail('baggage_belt', v)} />
            </div>
          </div>

          <div className="pf-detail-section">
            <div className="pf-detail-title">Delay likelihood</div>
            <div className="pf-risk-row">
              {DELAY_RISK.map((r) => (
                <button
                  key={r.id}
                  className={`pf-risk-chip${d.delay_risk === r.id ? ' active' : ''}`}
                  style={d.delay_risk === r.id ? { background: r.color, borderColor: r.color, color: '#fff' } : undefined}
                  onClick={() => saveDetail('delay_risk', r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {!d.delay_risk && <div className="pf-risk-hint">No live delay tracking connected — set your own estimate.</div>}
          </div>

          <div className="pf-detail-section">
            <div className="pf-detail-title">Aircraft</div>
            <div className="pf-detail-grid">
              <DetailCell label="Registration" value={d.aircraft_reg} mono onSave={(v) => saveDetail('aircraft_reg', v.toUpperCase())} />
            </div>
            {d.aircraft_reg && photo === undefined && <div className="photo-skel">loading aircraft…</div>}
            {d.aircraft_reg && photo === null && <div className="photo-none">No spotter photo for {d.aircraft_reg} yet</div>}
            {photo && (
              <a href={photo.link} target="_blank" rel="noreferrer" className="photo-link">
                <img src={photo.thumb} alt={d.aircraft_reg} loading="lazy" />
                <span className="photo-credit">
                  {d.aircraft_reg} · © {photo.photographer} / Planespotters
                </span>
              </a>
            )}
          </div>

          <button className="pf-edit-link" onClick={() => onEditEvent(event)}>
            edit date, time or notes →
          </button>
        </div>
      )}
    </div>
  )
}
