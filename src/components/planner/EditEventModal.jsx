import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { KIND_META } from '../../lib/planItems.js'

export default function EditEventModal({ event, onClose, onSaved }) {
  const meta = KIND_META[event.kind] || KIND_META.other
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

  return (
    <div className="add-sheet-backdrop" onClick={onClose}>
      <div className="add-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="add-sheet-grab" />
        <form className="add-sheet-form" onSubmit={save}>
          <div className="add-sheet-head">
            <span className="add-sheet-title">
              {meta.icon} Edit {meta.label.toLowerCase()}
            </span>
          </div>
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
      </div>
    </div>
  )
}
