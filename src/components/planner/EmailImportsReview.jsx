import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { KIND_META } from '../../lib/planItems.js'

// Reviews one pending email_imports row: pick which trip it belongs to
// (pre-guessed by date overlap, but always changeable), tick which
// extracted items to keep, then write them into planned_events exactly
// like the paste-a-booking flow does. Dismissing just marks it seen —
// nothing is ever written to an itinerary without this confirm step.
function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function EmailImportsReview({ imports, draftTrips, onClose, onChanged }) {
  const [index, setIndex] = useState(0)
  const [keep, setKeep] = useState(() => {
    const first = imports[0]
    return Object.fromEntries((first?.items || []).map((_, i) => [i, true]))
  })
  const [tripId, setTripId] = useState(imports[0]?.matched_trip_id || draftTrips[0]?.id || null)
  const [saving, setSaving] = useState(false)

  const current = imports[index]
  if (!current) return null

  function selectItem(i) {
    setKeep((k) => ({ ...k, [i]: !k[i] }))
  }

  function goNext() {
    const next = imports[index + 1]
    if (!next) {
      onClose()
      return
    }
    setIndex(index + 1)
    setKeep(Object.fromEntries((next.items || []).map((_, i) => [i, true])))
    setTripId(next.matched_trip_id || draftTrips[0]?.id || null)
  }

  async function dismiss() {
    await supabase.from('email_imports').update({ status: 'dismissed' }).eq('id', current.id)
    onChanged()
    goNext()
  }

  async function save() {
    if (!tripId) return
    setSaving(true)
    const rows = current.items
      .filter((_, i) => keep[i])
      .map((it) => ({
        trip_id: tripId,
        event_date: it.event_date,
        end_date: it.end_date || null,
        start_time: it.start_time || null,
        title: it.title,
        city: it.city || null,
        kind: it.kind,
        note: it.note ? `${it.note} · imported` : 'imported from a forwarded email',
        detail: { imported: true, source_subject: it.source_subject },
        done: false,
      }))
    if (rows.length) await supabase.from('planned_events').insert(rows)
    await supabase.from('email_imports').update({ status: 'reviewed', matched_trip_id: tripId }).eq('id', current.id)
    setSaving(false)
    onChanged()
    goNext()
  }

  const keepCount = Object.values(keep).filter(Boolean).length

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet gm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ios-sheet-grip" />
        <div className="ios-sheet-title">📧 From {current.from_address || 'an email'}</div>
        <div className="ios-sheet-sub">
          {current.subject ? `"${current.subject}" — ` : ''}
          found {current.items.length}. {imports.length > 1 ? `${index + 1} of ${imports.length}.` : ''}
        </div>

        <select className="account-input" value={tripId || ''} onChange={(e) => setTripId(e.target.value || null)}>
          <option value="" disabled>Which trip is this?</option>
          {draftTrips.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>

        <div className="gm-list">
          {current.items.map((it, i) => {
            const meta = KIND_META[it.kind] || KIND_META.other
            const shaky = (it.confidence ?? 1) < 0.7
            return (
              <button key={i} className={`gm-item${keep[i] ? ' on' : ''}`} onClick={() => selectItem(i)}>
                <span className="gm-check" style={keep[i] ? { background: meta.color, borderColor: meta.color } : undefined}>
                  {keep[i] ? '✓' : ''}
                </span>
                <span className="gm-item-i" style={{ color: meta.color }}>{meta.icon}</span>
                <span className="gm-item-body">
                  <span className="gm-item-title">{it.title}</span>
                  <span className="gm-item-sub">
                    {fmtDate(it.event_date)}
                    {it.end_date && it.end_date !== it.event_date ? ` – ${fmtDate(it.end_date)}` : ''}
                    {it.city ? ` · ${it.city}` : ''}
                    {shaky ? ' · not sure' : ''}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <button className="ios-sheet-done" onClick={save} disabled={keepCount === 0 || !tripId || saving}>
          {saving ? 'Adding…' : `Add ${keepCount} to ${draftTrips.find((t) => t.id === tripId)?.title || 'trip'}`}
        </button>
        <button className="account-btn ghost" onClick={dismiss}>Not a real booking — dismiss</button>
        <button className="account-btn ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
