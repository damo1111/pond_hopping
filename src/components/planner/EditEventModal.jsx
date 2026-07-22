import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { KIND_META } from '../../lib/planItems.js'
import PlaceEnrichment from './PlaceEnrichment.jsx'

// Place-like kinds are worth enriching with real photo/rating/nearby;
// flights and transport aren't (they're not a venue you look up).
const ENRICHABLE = new Set(['hotel', 'activity', 'place'])

export default function EditEventModal({ event, onClose, onSaved }) {
  const meta = KIND_META[event.kind] || KIND_META.other
  const [showEdit, setShowEdit] = useState(false)
  const enrichable = ENRICHABLE.has(event.kind) && (event.title || event.city)
  const [form, setForm] = useState({
    title: event.title || '',
    note: event.note || '',
    city: event.city || '',
    event_date: event.event_date || '',
    end_date: event.end_date || '',
    start_time: event.start_time || '',
    end_time: event.end_time || '',
  })
  const [saving, setSaving] = useState(false)

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    await supabase
      .from('planned_events')
      .update({
        title: form.title,
        note: form.note || null,
        city: form.city || null,
        event_date: form.event_date || null,
        end_date: form.end_date || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
      })
      .eq('id', event.id)
    setSaving(false)
    onSaved()
  }

  async function remove() {
    await supabase.from('planned_events').delete().eq('id', event.id)
    onSaved()
  }

  // A nearby thing added straight onto this item's day.
  async function addNearby(n) {
    await supabase.from('planned_events').insert({
      trip_id: event.trip_id,
      event_date: event.event_date,
      title: n.name,
      city: event.city || null,
      kind: 'place',
      note: n.type || null,
      detail: n.photo ? { photo: n.photo } : {},
      done: false,
    })
  }

  return (
    <div className="add-sheet-backdrop" onClick={onClose}>
      <div className="add-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="add-sheet-grab" />
        <div className="add-sheet-head">
          <span className="add-sheet-title">
            {meta.icon} {event.title || meta.label}
          </span>
        </div>

        {enrichable && <PlaceEnrichment name={event.title} city={event.city} onAddNearby={addNearby} />}

        {enrichable && !showEdit && (
          <button className="pe-edit-toggle" onClick={() => setShowEdit(true)}>
            edit date, time or details →
          </button>
        )}

        {(!enrichable || showEdit) && (
        <form className="add-sheet-form" onSubmit={save}>
          <label className="add-sheet-field">
            <span className="add-sheet-label">Title</span>
            <input className="plan-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
          </label>
          <label className="add-sheet-field">
            <span className="add-sheet-label">City</span>
            <input className="plan-input" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </label>
          <div className="add-sheet-row2">
            <label className="add-sheet-field">
              <span className="add-sheet-label">Day</span>
              <input className="plan-input" type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))} />
            </label>
            <label className="add-sheet-field">
              <span className="add-sheet-label">Time</span>
              <input className="plan-input" type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
            </label>
          </div>
          <label className="add-sheet-field">
            <span className="add-sheet-label">Note</span>
            <textarea className="plan-input" rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </label>
          <div className="plan-form-actions">
            <button type="button" className="plan-btn text-link plan-chat-discard" onClick={remove}>
              Delete
            </button>
            <button type="button" className="plan-btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="plan-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}
