import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TrackPlaces, { offersTracking } from './TrackPlaces.jsx'
import FirstPhotos from './FirstPhotos.jsx'
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

/**
 * A trip that has begun and is still going.
 *
 * A pin, a track already behind it, and the track carrying on past the edge
 * — which is the whole state being announced: started, recording, no end
 * date. Faster to read than "starts now, ends when it ends", and it says the
 * same thing.
 */
function Underway() {
  return (
    <div className="started-art">
      <svg viewBox="0 0 200 56" aria-hidden="true" focusable="false">
        <path className="started-been" d="M8 42 C34 42 44 20 68 20 S104 40 128 34" />
        <path className="started-ahead" d="M128 34 C150 29 162 16 194 16" />
        <circle className="started-was" cx="8" cy="42" r="3" />
        <circle className="started-was" cx="68" cy="20" r="3" />
        <circle className="started-now" cx="128" cy="34" r="6.5" />
        <circle className="started-now-dot" cx="128" cy="34" r="2.5" />
      </svg>
    </div>
  )
}

/** "9 Aug" — enough to tell two of these apart in a list. */
function stamp(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(now)
}

export default function StartNow({ onDone, onClose }) {
  const [where, setWhere] = useState('')
  const [busy, setBusy] = useState(false)
  const [trip, setTrip] = useState(null)
  const [error, setError] = useState(null)
  // Which of the two cards is showing. Location first because it is the only
  // one with a deadline — the days nobody records are simply gone — and
  // photographs second because they are the half that produces something to
  // look at within about four seconds.
  const [card, setCard] = useState('track')

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
  //
  // It was four sentences of prose about the difference between a browser's
  // geolocation and a phone's — David, 12 August: "far too wordy. can we make
  // this more visual and inform what user needs to do". True: at the moment
  // somebody has just started a trip they want to know it started, and what
  // to press. The distinction between platforms is real but it is an answer
  // to a question nobody has yet, and on a phone — where this screen
  // matters — it was never even shown.
  if (trip) {
    return (
      <div className="ios-sheet-overlay" onClick={onClose}>
        <div className="ios-sheet started" onClick={(e) => e.stopPropagation()}>
          <SheetGrip onClose={onClose} />
          <Underway />
          <div className="started-title">{trip.title} is on.</div>
          <div className="started-sub">It&apos;s in Plan. Rename it whenever.</div>

          {/* Two cards, in the order they are worth.
              David: "when they say im on one right now, we need cards again
              to tell them what to do i think? give us your location and we
              will build as you plod? then give us pics of what youve done so
              far — could even just be the airport/plane etc?"
              One at a time rather than both at once: stacked, they are a wall
              of text at the exact moment somebody wants to have started. */}
          {card === 'track' && offersTracking() && (
            <TrackPlaces onDone={() => setCard('photos')} />
          )}

          {card === 'track' && !offersTracking() && (
            <>
              <div className="started-note">
                On your phone I can note where you stop, and each day draws its own map. A
                browser tab can&apos;t.
              </div>
              <button className="ios-sheet-done" onClick={() => setCard('photos')}>
                Next
              </button>
            </>
          )}

          {card === 'photos' && <FirstPhotos trip={trip} onDone={onClose} />}
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
