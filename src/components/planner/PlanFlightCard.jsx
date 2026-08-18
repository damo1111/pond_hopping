import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { fetchAircraftPhoto } from '../../lib/planespotters.js'
import TailFin from '../TailFin.jsx'
import RouteMap from '../RouteMap.jsx'
import FlightSpan from '../FlightSpan.jsx'
import { dayShift, flightPhase, instantAt, saysNow, spanMinutes } from '../../lib/flightSpan.js'
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
  unbooked: { label: 'Not booked', cls: 'muted' },
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

  // A planned flight is still a span, and — unlike a flown one — it is the
  // only kind anybody is ever about to be on.
  //
  // The times live in the detail rather than in columns, as local wall-clock
  // strings against the event's own date. Composed into instants here so the
  // same duration, day shift and live states the flown card has can be shown
  // on the flight somebody is actually waiting for.
  //
  // Two corrections live here, and both were the same mistake: treating a
  // booking's wall-clock times as though they were instants.
  //
  // The zone. "00:20" at Bangkok and "07:00" at Heathrow are readings on two
  // clocks that are six hours apart, and subtracting them gave 6h 40m for a
  // flight that is 12h 40m in the air — see instantAt.
  //
  // The date. arrIso was built from event_date whichever day the flight
  // lands, so a red-eye's arrival was stamped with the departure's date. The
  // day shift below already knew about arr_date; the duration did not, and a
  // negative span is discarded, so the card silently showed no duration at
  // all on exactly the flights whose length is worth saying.
  //
  // Null rather than a fallback where an airport has no zone: a duration we
  // cannot compute correctly is left unsaid, which is what spanMinutes does
  // with a negative one and for the same reason.
  const whenIs = (date, t) => (date && t ? `${date}T${String(t).slice(0, 5)}:00` : null)
  const depIso = instantAt(whenIs(event.event_date, event.start_time), d.dep_airport)
  const arrIso = instantAt(whenIs(d.arr_date || event.event_date, d.arr_time), d.arr_airport)
  const mins = spanMinutes(depIso, arrIso)
  const shift = dayShift(event.event_date, d.arr_date || event.event_date)
  const phase = flightPhase({ dep_time: depIso, arr_time: arrIso })
  const flying = phase.phase === 'airborne'
  const now = saysNow({ dep_time: depIso, arr_time: arrIso })
  const gateOf = (terminal, gate) =>
    [terminal ? `T${terminal}` : null, gate ? `Gate ${gate}` : null].filter(Boolean).join(' · ') || null
  const km =
    AIRPORT_COORDS[d.dep_airport] && AIRPORT_COORDS[d.arr_airport]
      ? distanceKm(AIRPORT_COORDS[d.dep_airport], AIRPORT_COORDS[d.arr_airport])
      : null

  return (
    <div className={`flight-card pf-card${open ? ' open' : ''}`}>
      <button className="flight-head board" onClick={() => setOpen((o) => !o)}>
        <span className="fh-thumb">
          <TailFin airline={d.airline || d.flight_number} size={22} />
          <span className={`pf-status pf-status-${status.cls}`}>{status.label}</span>
        </span>
        <span className="fh-main">
          <FlightSpan
            dep={{
              code: dep,
              city: d.dep_city,
              time: (event.start_time || '--:--').slice(0, 5),
              at: gateOf(d.dep_terminal, d.dep_gate),
            }}
            arr={{
              code: arr,
              city: d.arr_city,
              time: (d.arr_time || '--:--').slice(0, 5),
              at: gateOf(d.arr_terminal, d.arr_gate),
            }}
            number={d.flight_number}
            minutes={mins}
            shift={shift}
            flying={flying ? { part: phase.part } : null}
          />
          {/* The states that only an upcoming flight has: hours to go, then
              minutes, then the gate, then how far across it is. Built in #22
              and until now unreachable, because they were wired to the card
              that only ever renders flights already taken. */}
          {now && <span className="fh-now">{now}</span>}
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

          {/* Where it actually goes. The card knew the terminal, the gate,
              the baggage belt and what the aeroplane looks like, and never
              once said where it was flying to. */}
          <RouteMap dep={dep} arr={arr} className="flight-map pf-map" />

          <div className="pf-detail-section">
            <div className="pf-detail-title">Aircraft</div>
            <div className="pf-detail-grid">
              <DetailCell label="Registration" value={d.aircraft_reg} mono onSave={(v) => saveDetail('aircraft_reg', v.toUpperCase())} />
            </div>
            {d.aircraft_reg && photo === undefined && <div className="photo-skel">loading aircraft…</div>}
            {d.aircraft_reg && photo === null && <div className="photo-none">No spotter photo for {d.aircraft_reg} yet</div>}
            {photo && (
              <a href={photo.link} target="_blank" rel="noreferrer" className="photo-link photo-link--band">
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
