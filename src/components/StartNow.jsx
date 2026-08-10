import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TrackPlaces, { offersTracking } from './TrackPlaces.jsx'
import SheetGrip from './SheetGrip.jsx'
import { today } from '../lib/goingSoon.js'

// A trip that nobody planned.
//
// Every other way in assumes the trip already happened or is already booked:
// photos to read dates out of, a Google Timeline to import, a confirmation
// email to parse. None of them help somebody who is leaving in an hour and
// booked nothing, which is a real and ordinary way to travel — and the one
// case where recording matters most, because there is no itinerary for the
// app to fall back on.
//
// So: one field, and it is optional. The trip starts today, has no end date
// because nobody knows yet, and the places fill themselves in. A name can be
// wrong for a week without costing anything; a week of unrecorded days
// cannot be recovered at all, so the button comes before the questions.

/** "9 Aug" — enough to tell two of these apart in a list. */
function stamp(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(now)
}

export default function StartNow({ onDone, onClose }) {
  const [where, setWhere] = useState('')
  const [busy, setBusy] = useState(false)
  const [trip, setTrip] = useState(null)
  const [error, setError] = useState(null)

  async function begin(e) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    const title = where.trim() || `Trip from ${stamp()}`
    const { data, error: err } = await supabase
      .from('trips')
      .insert({
        slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`,
        title,
        // Starts now. No end date: she does not know it yet, and inventing
        // one would either stop the recording early or never stop it.
        start_date: today(),
        end_date: null,
        countries: [],
        // Confirmed, not a draft, and this is load-bearing rather than
        // tidiness. The recorder is driven from the confirmed trips and
        // ignores drafts outright — a draft is a plan, and following
        // somebody around because they once sketched an idea would be
        // indefensible. So a draft here would have made the one route built
        // to start recording create exactly the kind of trip the recorder
        // will not act on, and nothing would have been noted at all.
        //
        // It is also just true. You are not planning this trip. You are on
        // it.
        status: 'confirmed',
        sort_order: 0,
      })
      .select('id,title,slug')
      .single()
    setBusy(false)
    if (err) return setError(err.message)
    // The slug, so the caller can open the trip it just made rather than
    // reloading the app and hoping it turns up in a list.
    onDone?.(data)
    setTrip(data)
  }

  // Made. Now the only thing that matters, on its own screen rather than
  // under a confirmation nobody reads.
  if (trip) {
    return (
      <div className="ios-sheet-overlay" onClick={onClose}>
        <div className="ios-sheet" onClick={(e) => e.stopPropagation()}>
          <SheetGrip onClose={onClose} />
          <div className="ios-sheet-title">{trip.title} has started</div>
          <div className="ios-sheet-sub">
            It&apos;s in Plan, and you can rename it whenever. Nothing else needs doing.
          </div>
          {offersTracking() ? (
            <TrackPlaces onDone={onClose} />
          ) : (
            <div className="track-note">
              Open this on your phone and the app can note the places you stop, so each day gets
              its own map without you logging anything. A browser can&apos;t — it only records
              while the tab is open, which is never the bit that matters.
            </div>
          )}
          <button className="account-btn ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <form className="ios-sheet" onClick={(e) => e.stopPropagation()} onSubmit={begin}>
        <SheetGrip onClose={onClose} />
        <div className="ios-sheet-title">Start hopping</div>
        {/* Two clauses, because the second one is the promise and the first
            is the only thing anybody needs to believe to tap the button. */}
        <div className="ios-sheet-sub">Starts now, ends when it ends.</div>
        {/* The question earns its keep by not needing an answer. "We'll work
            it out" is not a flourish either — with places being noted, the
            app genuinely does. */}
        <input
          className="account-input"
          autoFocus
          placeholder="Where to? Or don't — we'll work it out"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
        />
        <button className="ios-sheet-done" type="submit" disabled={busy}>
          {busy ? 'Off you go…' : 'Start hopping'}
        </button>
        {error && <div className="account-error">{error}</div>}
      </form>
    </div>
  )
}
