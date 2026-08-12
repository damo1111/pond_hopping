import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { callApi } from '../lib/apiBase.js'
import { plainly } from '../lib/apiTrouble.js'
import { tripShape } from '../lib/tripFromBooking.js'
import { KIND_META } from '../lib/planItems.js'
import { oops, track } from '../lib/analytics.js'
import SheetGrip from './SheetGrip.jsx'
import ForwardBookings from './planner/ForwardBookings.jsx'

// Paste a confirmation, get a trip.
//
// The extraction has existed for a long while and was good; it just lived
// inside a trip's planner, so the route advertised on the front door — "Paste
// a confirmation" — closed the sheet and sent somebody to the Plan tab to go
// and build the trip first. Which is backwards, and read as the button doing
// nothing: David, 12 August, "takes a hopper to the trip plan screen. this is
// wrong."
//
// The confirmation is the thing that knows where you are going and when. So
// it is read first and the trip is made from what it says — dates, title and
// all — and the only question asked is whether that is right.

function when(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function span(shape) {
  if (!shape) return ''
  return shape.start_date === shape.end_date
    ? when(shape.start_date)
    : `${when(shape.start_date)} – ${when(shape.end_date)}`
}

export default function StartFromPaste({ onDone, onClose }) {
  const [phase, setPhase] = useState('entry') // entry | reading | review | saving
  const [text, setText] = useState('')
  const [items, setItems] = useState([])
  const [keep, setKeep] = useState({})
  const [title, setTitle] = useState('')
  const [trouble, setTrouble] = useState(null)

  const chosen = items.filter((_, i) => keep[i])
  const shape = tripShape(chosen, Date.now())

  async function read() {
    if (!text.trim()) return
    setPhase('reading')
    setTrouble(null)
    try {
      const r = await callApi('/api/parse-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No window: there is no trip yet, which is the whole point.
        body: JSON.stringify({ text }),
      })
      if (!r.ok) {
        const said = await r.clone().text().catch(() => '')
        setTrouble(plainly(r.status, said))
        setPhase('entry')
        return
      }
      const found = (await r.json()).items ?? []
      if (!found.length) {
        setTrouble("Couldn't find a booking in that. A flight or hotel confirmation works best.")
        setPhase('entry')
        return
      }
      setItems(found)
      setKeep(Object.fromEntries(found.map((_, i) => [i, true])))
      setTitle('')
      setPhase('review')
      track('paste_read', { found: found.length })
    } catch (e) {
      setTrouble(plainly(0))
      oops('paste', e, 'StartFromPaste')
      setPhase('entry')
    }
  }

  async function make() {
    if (!shape) return
    setPhase('saving')
    setTrouble(null)
    const named = title.trim() || shape.title
    const { data: trip, error } = await supabase
      .from('trips')
      .insert({
        ...shape,
        title: named,
        // Booked, therefore real. A draft would keep it out of the recorder
        // and off the globe, which is not what somebody who has just handed
        // over a boarding pass is asking for.
        status: 'confirmed',
        sort_order: 0,
      })
      .select('id,title,slug')
      .single()

    if (error) {
      setTrouble('That trip would not save. Worth trying again.')
      oops('paste', error, 'StartFromPaste/trip')
      setPhase('review')
      return
    }

    const rows = chosen.map((it) => ({
      trip_id: trip.id,
      event_date: it.event_date,
      end_date: it.end_date || null,
      start_time: it.start_time || null,
      title: it.title,
      city: it.city || null,
      kind: it.kind,
      note: it.note ? `${it.note} · imported` : 'imported from a booking',
      detail: { ...(it.detail ?? {}), imported: true, source_subject: it.source_subject },
      done: false,
    }))
    // The trip exists either way. An itinerary that failed to insert is
    // recoverable by pasting again; a trip that was never made is not, and
    // sending somebody back to an empty sheet after they watched it read
    // their booking is the worse of the two.
    if (rows.length) {
      const { error: itemsFailed } = await supabase.from('planned_events').insert(rows)
      if (itemsFailed) oops('paste', itemsFailed, 'StartFromPaste/events')
    }
    track('paste_trip_made', { items: rows.length })
    onDone?.(trip)
  }

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet paste-sheet" onClick={(e) => e.stopPropagation()}>
        <SheetGrip onClose={onClose} />

        {phase === 'entry' && (
          <>
            <div className="ios-sheet-title">Paste a confirmation</div>
            <div className="ios-sheet-sub">
              A flight, a hotel, a train. I&apos;ll work the trip out from it.
            </div>
            {/* Forwarding first, because the confirmation is already sitting
                in a mail app one tap away, and pasting means select-all in an
                email on a phone. */}
            <ForwardBookings />
            <div className="gm-or">or paste it in</div>
            <textarea
              className="account-input gm-paste"
              rows={6}
              placeholder="Paste the booking email here…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="ios-sheet-done" onClick={read} disabled={!text.trim()}>
              Read it
            </button>
            {trouble && <div className="account-error">{trouble}</div>}
          </>
        )}

        {phase === 'reading' && (
          <div className="gm-status">
            <div className="gm-spin">📬</div>
            <div className="ios-sheet-title">Reading it…</div>
            <div className="ios-sheet-sub">Pulling out the flights, stays and bookings.</div>
          </div>
        )}

        {(phase === 'review' || phase === 'saving') && (
          <>
            <div className="ios-sheet-title">{shape ? 'Looks like a trip' : 'Nothing left to keep'}</div>
            <div className="ios-sheet-sub">
              {shape
                ? 'Untick anything that is not part of it. Nothing is saved until you say.'
                : 'Tick at least one booking and this becomes a trip.'}
            </div>

            {shape && (
              <div className="paste-shape">
                <input
                  className="account-input paste-name"
                  value={title}
                  placeholder={shape.title}
                  aria-label="Trip name"
                  onChange={(e) => setTitle(e.target.value)}
                />
                <div className="paste-when">{span(shape)}</div>
              </div>
            )}

            <div className="paste-items">
              {items.map((it, i) => (
                <label key={`${it.event_date}-${it.title}-${i}`} className="paste-item">
                  <input
                    type="checkbox"
                    checked={!!keep[i]}
                    onChange={() => setKeep((k) => ({ ...k, [i]: !k[i] }))}
                  />
                  <span className="paste-item-i">{(KIND_META[it.kind] || KIND_META.other).icon}</span>
                  <span className="paste-item-text">
                    <span className="paste-item-title">{it.title}</span>
                    <span className="paste-item-sub">
                      {when(it.event_date)}
                      {it.end_date && it.end_date !== it.event_date ? ` – ${when(it.end_date)}` : ''}
                      {it.city ? ` · ${it.city}` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <button className="ios-sheet-done" onClick={make} disabled={!shape || phase === 'saving'}>
              {phase === 'saving' ? 'Making it…' : 'Make the trip'}
            </button>
            {trouble && <div className="account-error">{trouble}</div>}
            <button className="account-btn ghost" onClick={() => setPhase('entry')}>
              Paste something else
            </button>
          </>
        )}
      </div>
    </div>
  )
}
