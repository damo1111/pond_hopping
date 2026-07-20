import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { fetchAircraftPhoto } from '../../lib/planespotters.js'
import { fmtTime } from '../../lib/planItems.js'

// Upcoming-flight card in the spirit of Flighty / ByAir: airline + number,
// a status pill, big origin→destination with local times, and a subtle
// route progress line. Tapping expands it in place — terminal/baggage
// belt for both ends, delay likelihood, and aircraft registration (which,
// once entered, fetches a real Planespotters photo exactly like the
// Flights tab's FlightCard already does).
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

// Mirrors FlightCard.jsx's Meta component exactly — same interaction,
// same classes — just under a different name since this is a distinct
// component file.
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
        className="meta-cell meta-cell-add"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        <div className="meta-label">{label}</div>
        <div className="meta-value meta-add-cta">+ add</div>
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

  return (
    <div className={`pf-card${open ? ' open' : ''}`}>
      <button className="pf-head" onClick={() => setOpen((o) => !o)}>
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

      {open && (
        <div className="pf-details" onClick={(e) => e.stopPropagation()}>
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
