import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { API_BASE } from '../../lib/apiBase.js'
import { getGoogleToken } from '../../lib/google.js'
import { KIND_META } from '../../lib/planItems.js'

// Turn a booking into trip items with zero setup: paste (or forward →
// copy) the confirmation email and the same AI extraction pulls out the
// flights/stays/dinners. If the user happens to have connected Google, a
// "scan my whole inbox" shortcut is offered too — but paste is the path
// that always works, no OAuth, no console. Nothing is saved until the
// review step is confirmed.
function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function GmailImport({ trip, onClose, onImported }) {
  const [state, setState] = useState('entry') // entry | working | review | saving | done | error
  const [text, setText] = useState('')
  const [items, setItems] = useState([])
  const [keep, setKeep] = useState({})
  const [error, setError] = useState(null)
  const hasGoogle = !!getGoogleToken()

  function receive(list) {
    setItems(list)
    setKeep(Object.fromEntries(list.map((_, i) => [i, true])))
    setState('review')
  }

  async function parsePasted() {
    if (!text.trim()) return
    setState('working')
    try {
      const r = await fetch(`${API_BASE}/api/parse-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, start: trip.start_date, end: trip.end_date }),
      })
      if (!r.ok) throw new Error()
      const d = await r.json()
      receive(d.items || [])
    } catch {
      setState('error')
      setError('parse-failed')
    }
  }

  async function scanInbox() {
    const token = getGoogleToken()
    if (!token) return
    setState('working')
    try {
      const r = await fetch(`${API_BASE}/api/gmail-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token, start: trip.start_date, end: trip.end_date }),
      })
      if (!r.ok) throw new Error()
      const d = await r.json()
      receive(d.items || [])
    } catch {
      setState('error')
      setError('scan-failed')
    }
  }

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
        note: it.note ? `${it.note} · imported` : 'imported from a booking',
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

        {state === 'entry' && (
          <>
            <div className="ios-sheet-title">Add a booking</div>
            <div className="ios-sheet-sub">
              Paste a confirmation email (flight, hotel, restaurant, tickets) and I'll pull out what belongs to this
              trip. Forward it to yourself first if it's easier, then copy the text in.
            </div>
            <textarea
              className="account-input gm-paste"
              rows={6}
              placeholder="Paste the booking email here…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="ios-sheet-done" onClick={parsePasted} disabled={!text.trim()}>
              Find bookings
            </button>
            {hasGoogle && (
              <button className="account-btn ghost" onClick={scanInbox}>
                or scan my whole inbox
              </button>
            )}
            <button className="account-btn ghost" onClick={onClose}>Cancel</button>
          </>
        )}

        {state === 'working' && (
          <div className="gm-status">
            <div className="gm-spin">📬</div>
            <div className="ios-sheet-title">Reading it…</div>
            <div className="ios-sheet-sub">Pulling out anything between {fmtDate(trip.start_date)} and {fmtDate(trip.end_date)}.</div>
          </div>
        )}

        {state === 'error' && (
          <div className="gm-status">
            <div className="ios-sheet-title">Couldn't read that</div>
            <div className="ios-sheet-sub">Something went wrong — try pasting the email again.</div>
            <button className="account-btn ghost" onClick={() => setState('entry')}>Back</button>
          </div>
        )}

        {state === 'review' && items.length === 0 && (
          <div className="gm-status">
            <div className="ios-sheet-title">Nothing found for these dates</div>
            <div className="ios-sheet-sub">Couldn't spot a booking between {fmtDate(trip.start_date)} and {fmtDate(trip.end_date)} in that. Try another email, or add it by hand.</div>
            <button className="account-btn ghost" onClick={() => setState('entry')}>Try another</button>
          </div>
        )}

        {state === 'review' && items.length > 0 && (
          <>
            <div className="ios-sheet-title">Found {items.length}</div>
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
            <button className="account-btn ghost" onClick={() => setState('entry')}>Paste another</button>
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
