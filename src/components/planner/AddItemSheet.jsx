import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { KIND_META, ADD_KINDS } from '../../lib/planItems.js'

// Per-kind field sets. Everything writes to the one planned_events row —
// type-specific bits (flight number, address…) go in `detail`.
const FIELDS = {
  flight: [
    { key: 'airline', label: 'Airline', ph: 'British Airways', detail: true },
    { key: 'flight_number', label: 'Flight no.', ph: 'BA16', detail: true },
    { key: 'dep_airport', label: 'From', ph: 'SYD', detail: true, up: true },
    { key: 'arr_airport', label: 'To', ph: 'LHR', detail: true, up: true },
    { key: 'start_time', label: 'Departs', type: 'time' },
    { key: 'end_time', label: 'Arrives', type: 'time' },
  ],
  hotel: [
    { key: 'title', label: 'Place', ph: 'Island Serenity Suites' },
    { key: 'city', label: 'City', ph: 'London' },
    { key: 'event_date', label: 'Check in', type: 'date' },
    { key: 'end_date', label: 'Check out', type: 'date' },
  ],
  transport: [
    { key: 'title', label: 'What', ph: 'Train to Venice' },
    { key: 'city', label: 'To', ph: 'Venice' },
    { key: 'start_time', label: 'Time', type: 'time' },
  ],
  car_hire: [
    { key: 'title', label: 'Provider', ph: 'Hertz — compact' },
    { key: 'city', label: 'Pick-up', ph: 'Edinburgh' },
    { key: 'event_date', label: 'Pick-up', type: 'date' },
    { key: 'end_date', label: 'Return', type: 'date' },
  ],
  place: [
    { key: 'title', label: 'Place', ph: 'Wailua Falls' },
    { key: 'city', label: 'City', ph: 'Kauai' },
    { key: 'start_time', label: 'Time', type: 'time' },
  ],
  activity: [
    { key: 'title', label: 'Activity', ph: 'Zip-line tour' },
    { key: 'city', label: 'Where', ph: 'Kauai' },
    { key: 'start_time', label: 'Time', type: 'time' },
  ],
}

function titleForFlight(detail) {
  const parts = []
  if (detail.flight_number) parts.push(detail.flight_number)
  if (detail.dep_airport || detail.arr_airport) parts.push(`${detail.dep_airport || '—'} → ${detail.arr_airport || '—'}`)
  return parts.join('  ') || 'Flight'
}

export default function AddItemSheet({ tripId, day, onClose, onAdded, onAskAI }) {
  const [kind, setKind] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [nl, setNl] = useState('')

  function pick(k) {
    setKind(k)
    setForm({ event_date: day || '' })
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const fields = FIELDS[kind]
    const detail = {}
    const row = { trip_id: tripId, kind, done: false, event_date: day || null }
    for (const f of fields) {
      const v = form[f.key]
      if (v == null || v === '') continue
      if (f.detail) detail[f.key] = f.up ? v.toUpperCase() : v
      else row[f.key] = v
    }
    if (kind === 'flight') {
      row.title = titleForFlight(detail)
      row.city = detail.arr_city || detail.arr_airport || null
      detail.status = detail.status || 'scheduled'
    }
    if (!row.title) row.title = form.title || KIND_META[kind].label
    row.detail = detail
    // Photo: reuse the same free Wikipedia lookup the wishlist uses.
    if (row.city && kind !== 'flight') {
      try {
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(row.city)}`)
        if (r.ok) {
          const d = await r.json()
          if (d.type !== 'disambiguation') row.photo_url = d.thumbnail?.source || null
        }
      } catch {
        /* photo is optional */
      }
    }
    await supabase.from('planned_events').insert(row)
    setSaving(false)
    onAdded()
    onClose()
  }

  return (
    <div className="add-sheet-backdrop" onClick={onClose}>
      <div className="add-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="add-sheet-grab" />
        {!kind ? (
          <>
            <div className="add-sheet-nl">
              <input
                className="plan-input"
                placeholder="Describe it — “car hire in Edinburgh from the 14th”"
                value={nl}
                onChange={(e) => setNl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && nl.trim()) {
                    onAskAI(nl.trim())
                    onClose()
                  }
                }}
              />
              <button
                className="add-sheet-ai"
                disabled={!nl.trim()}
                onClick={() => {
                  onAskAI(nl.trim())
                  onClose()
                }}
              >
                ✨
              </button>
            </div>
            <div className="add-sheet-or">or add manually</div>
            <div className="add-sheet-kinds">
              {ADD_KINDS.map((k) => (
                <button key={k} className="add-sheet-kind" onClick={() => pick(k)}>
                  <span className="add-sheet-kind-i" style={{ background: KIND_META[k].color }}>
                    {KIND_META[k].icon}
                  </span>
                  {KIND_META[k].label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <form className="add-sheet-form" onSubmit={save}>
            <div className="add-sheet-head">
              <button type="button" className="add-sheet-back" onClick={() => setKind(null)}>
                ‹
              </button>
              <span className="add-sheet-title">
                {KIND_META[kind].icon} Add {KIND_META[kind].label.toLowerCase()}
              </span>
            </div>
            {FIELDS[kind].map((f) => (
              <label key={f.key} className="add-sheet-field">
                <span className="add-sheet-label">{f.label}</span>
                <input
                  className="plan-input"
                  type={f.type || 'text'}
                  placeholder={f.ph || ''}
                  value={form[f.key] || ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </label>
            ))}
            {!FIELDS[kind].some((f) => f.key === 'event_date') && (
              <label className="add-sheet-field">
                <span className="add-sheet-label">Day</span>
                <input
                  className="plan-input"
                  type="date"
                  value={form.event_date || ''}
                  onChange={(e) => setForm((s) => ({ ...s, event_date: e.target.value }))}
                />
              </label>
            )}
            <div className="plan-form-actions">
              <button type="button" className="plan-btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="plan-btn" disabled={saving}>
                {saving ? 'Adding…' : 'Add to trip'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
