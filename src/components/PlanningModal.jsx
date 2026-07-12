import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

function fmtDate(iso) {
  if (!iso) return 'no date yet'
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// A lightweight checklist for a draft trip's planned commitments — kept
// separate from the main tab system (Flights/Journal/Map/Photos) since a
// draft trip has none of that data yet, just a list of things to do/log
// before it becomes a real trip.
export default function PlanningModal({ trip, events, onClose, onEventsChange }) {
  const [busy, setBusy] = useState(null)

  async function toggleDone(ev) {
    setBusy(ev.id)
    const { error } = await supabase.from('planned_events').update({ done: !ev.done }).eq('id', ev.id)
    if (!error) onEventsChange(events.map((e) => (e.id === ev.id ? { ...e, done: !e.done } : e)))
    setBusy(null)
  }

  const sorted = [...events].sort((a, b) => (a.event_date || '9999').localeCompare(b.event_date || '9999'))
  const doneCount = events.filter((e) => e.done).length

  return (
    <div className="planning-modal-backdrop" onClick={onClose}>
      <div className="planning-modal" onClick={(e) => e.stopPropagation()}>
        <div className="planning-modal-head">
          <div>
            <div className="planning-modal-title">{trip.title}</div>
            <div className="planning-modal-sub">
              {trip.traveler ? `${trip.traveler} · ` : ''}
              {trip.subtitle} · {doneCount}/{events.length} done
            </div>
          </div>
          <button className="planning-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="planning-modal-list">
          {sorted.length === 0 && <div className="planning-modal-empty">Nothing planned yet.</div>}
          {sorted.map((ev) => (
            <button
              key={ev.id}
              className={`planning-event${ev.done ? ' done' : ''}`}
              onClick={() => toggleDone(ev)}
              disabled={busy === ev.id}
            >
              <span className="planning-event-check">{ev.done ? '✓' : ''}</span>
              <span className="planning-event-body">
                <span className="planning-event-title">{ev.title}</span>
                <span className="planning-event-meta">
                  {fmtDate(ev.event_date)}
                  {ev.city ? ` · ${ev.city}` : ''}
                </span>
                {ev.note && <span className="planning-event-note">{ev.note}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
