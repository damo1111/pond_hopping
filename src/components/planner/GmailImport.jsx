import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { API_BASE } from '../../lib/apiBase.js'
import { getGoogleToken } from '../../lib/google.js'
import { KIND_META } from '../../lib/planItems.js'

// The review step for the inbox scan. It never adds anything on its own —
// it shows what it found, pre-ticked, and only the ones the user keeps get
// written. Confidence is surfaced honestly ("not sure" on the shaky ones)
// so a wrong guess is easy to spot and untick.
function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function GmailImport({ trip, onClose, onImported }) {
  const [state, setState] = useState('scanning') // scanning | review | saving | done | error
  const [items, setItems] = useState([])
  const [keep, setKeep] = useState({}) // index -> bool
  const [scanned, setScanned] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    const token = getGoogleToken()
    if (!token) {
      setState('error')
      setError('no-token')
      return
    }
    fetch(`${API_BASE}/api/gmail-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: token, start: trip.start_date, end: trip.end_date }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        if (!alive) return
        setItems(d.items || [])
        setScanned(d.scanned || 0)
        setKeep(Object.fromEntries((d.items || []).map((_, i) => [i, true]))) // all pre-ticked
        setState('review')
      })
      .catch(() => alive && (setState('error'), setError('scan-failed')))
    return () => {
      alive = false
    }
  }, [trip.id])

  async function save() {
    setState('saving')
    const rows = items
      .filter((_, i) => keep[i])
      .map((it) => ({
        trip_id: trip.id,
        event_date: it.event_date,
        end_date: it.end_date || null,
        start_time: it.start_time || null,
        title: it.title,
        city: it.city || null,
        kind: it.kind,
        note: it.note ? `${it.note} · imported from inbox` : 'imported from inbox',
        detail: { imported: true, source_subject: it.source_subject },
        done: false,
      }))
    if (rows.length) await supabase.from('planned_events').insert(rows)
    setState('done')
    onImported?.()
  }

  const keepCount = Object.values(keep).filter(Boolean).length

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet gm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ios-sheet-grip" />

        {state === 'scanning' && (
          <div className="gm-status">
            <div className="gm-spin">📬</div>
            <div className="ios-sheet-title">Reading your inbox…</div>
            <div className="ios-sheet-sub">Looking for flights, stays, restaurants and tickets between {fmtDate(trip.start_date)} and {fmtDate(trip.end_date)}.</div>
          </div>
        )}

        {state === 'error' && (
          <div className="gm-status">
            <div className="ios-sheet-title">{error === 'no-token' ? 'Connect Gmail first' : "Couldn't scan just now"}</div>
            <div className="ios-sheet-sub">
              {error === 'no-token'
                ? 'Sign in with Google (tap the duck) to let Pond Hopping read this trip from your inbox.'
                : 'Something went wrong reading your inbox — try again in a moment.'}
            </div>
            <button className="account-btn ghost" onClick={onClose}>Close</button>
          </div>
        )}

        {state === 'review' && items.length === 0 && (
          <div className="gm-status">
            <div className="ios-sheet-title">Nothing found for these dates</div>
            <div className="ios-sheet-sub">Scanned {scanned} emails but found no bookings between {fmtDate(trip.start_date)} and {fmtDate(trip.end_date)}. You can always add things by hand or ask the planner.</div>
            <button className="account-btn ghost" onClick={onClose}>Close</button>
          </div>
        )}

        {state === 'review' && items.length > 0 && (
          <>
            <div className="ios-sheet-title">Found {items.length} in your inbox</div>
            <div className="ios-sheet-sub">Tick what to add — nothing's saved until you confirm.</div>
            <div className="gm-list">
              {items.map((it, i) => {
                const meta = KIND_META[it.kind] || KIND_META.other
                const shaky = (it.confidence ?? 1) < 0.7
                return (
                  <button key={i} className={`gm-item${keep[i] ? ' on' : ''}`} onClick={() => setKeep((k) => ({ ...k, [i]: !k[i] }))}>
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
            <button className="ios-sheet-done" onClick={save} disabled={keepCount === 0}>
              Add {keepCount} to the trip
            </button>
            <button className="account-btn ghost" onClick={onClose}>Not now</button>
          </>
        )}

        {state === 'saving' && (
          <div className="gm-status">
            <div className="ios-sheet-title">Adding to your trip…</div>
          </div>
        )}

        {state === 'done' && (
          <div className="gm-status">
            <div className="gm-spin">✅</div>
            <div className="ios-sheet-title">Added {keepCount} to your trip</div>
            <div className="ios-sheet-sub">They're in your itinerary now — the Concierge will factor them into what's still left to book.</div>
            <button className="ios-sheet-done" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}
