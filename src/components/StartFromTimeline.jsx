import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  AWAY_KM,
  dayTracks,
  parseTimeline,
  suggestTripTitle,
  summariseTrip,
  tripsFromTimeline,
} from '../lib/timelineImport.js'
import { slugify } from '../lib/tripFromPhotos.js'
import TrackPlaces from './TrackPlaces.jsx'
import SheetGrip from './SheetGrip.jsx'

// "Every trip I've ever taken."
//
// Photos do one trip at a time and need the photos to still exist. A Google
// Timeline export does the lot, in one file, and needs no permission from
// anybody: it is a download, so it works on Android, on iOS and on the web,
// and it reaches back years.
//
// The file never leaves the phone. It is read in the browser, turned into a
// list of candidate trips, and only the trips you tick are ever sent — which
// is the only honest way to handle a file that also contains every hospital
// appointment and every night you didn't go home.

const MAX_MB = 400

export default function StartFromTimeline({ onDone, onClose }) {
  const input = useRef(null)
  const [phase, setPhase] = useState('idle') // idle | reading | review | saving | done
  const [found, setFound] = useState(null)
  const [chosen, setChosen] = useState({})
  const [titles, setTitles] = useState({})
  const [existing, setExisting] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState(null)

  async function choose(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_MB * 1024 * 1024) {
      return setError(
        `That file is ${Math.round(file.size / 1e6)}MB, which is more than a browser can hold. If it's Records.json from Takeout, use the Timeline export from your phone instead — it's the same trips, a fraction of the size.`
      )
    }
    setPhase('reading')
    setError(null)

    // Let the "reading" screen paint before a multi-megabyte JSON.parse takes
    // the main thread for a couple of seconds.
    await new Promise((r) => setTimeout(r, 30))

    try {
      const parsed = parseTimeline(await file.text())
      if (parsed.format === 'unparseable' || parsed.format === 'unknown') {
        setPhase('idle')
        return setError(
          "That doesn't look like a Timeline export. It should be a .json file — Timeline.json from your phone, or the files inside Takeout's Semantic Location History folder."
        )
      }
      const result = tripsFromTimeline(parsed)
      if (!result.trips.length) {
        setPhase('idle')
        return setError(
          result.home
            ? `Read it, but every day in it was within ${AWAY_KM}km of home. If the trips you're after are in a different file, try that one.`
            : 'Read it, but there were no located days in it at all.'
        )
      }

      // Trips already in the log shouldn't be offered again — re-importing a
      // year later is a normal thing to do, and a second copy of Lisbon is
      // not what anybody wants from it.
      const { data: have } = await supabase
        .from('trips')
        .select('title,start_date,end_date')
        .not('start_date', 'is', null)
      setExisting(have ?? [])

      const dup = (t) =>
        (have ?? []).some(
          (h) => h.start_date <= (t.end || t.start) && (h.end_date ?? h.start_date) >= t.start
        )
      setFound(result)
      setChosen(Object.fromEntries(result.trips.map((t, i) => [i, !dup(t)])))
      setTitles(Object.fromEntries(result.trips.map((t, i) => [i, suggestTripTitle(t)])))
      setPhase('review')
    } catch (err) {
      setPhase('idle')
      setError(err?.message || 'That file could not be read.')
    }
  }

  const picked = useMemo(
    () => (found?.trips ?? []).map((t, i) => ({ trip: t, i })).filter(({ i }) => chosen[i]),
    [found, chosen]
  )

  const overlaps = (t) =>
    existing.some((h) => h.start_date <= (t.end || t.start) && (h.end_date ?? h.start_date) >= t.start)

  async function create() {
    setPhase('saving')
    setError(null)
    setProgress({ done: 0, total: picked.length })
    let made = 0
    let last = null
    for (const { trip, i } of picked) {
      try {
        const title = (titles[i] || suggestTripTitle(trip)).trim()
        const { data: row, error: err } = await supabase
          .from('trips')
          .insert({
            slug: slugify(title, trip.start),
            title,
            start_date: trip.start,
            end_date: trip.end,
            countries: [],
            status: 'confirmed',
            sort_order: 0,
          })
          .select('id,slug')
          .single()
        if (err || !row) throw err || new Error('could not create')

        // The day maps come free: the export already knows where you went on
        // each day, in exactly the shape the day map reads.
        const tracks = dayTracks(trip).map((t) => ({ ...t, trip_id: row.id }))
        if (tracks.length) await supabase.from('day_tracks').insert(tracks)
        made++
        last = row
      } catch {
        // One trip that won't save shouldn't cost you the other thirty-nine.
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }
    setProgress({ done: made, total: picked.length })
    setPhase('done')
    if (last) onDone?.(last)
  }

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet route-sheet" onClick={(e) => e.stopPropagation()}>
        <SheetGrip onClose={onClose} />

        {phase === 'idle' && (
          <>
            <div className="ios-sheet-title">Bring your timeline in</div>
            <div className="ios-sheet-sub">
              If Google has been keeping your timeline, it already knows every trip you've taken.
              Export it and drop the file here — I'll find the trips in it and you pick which ones
              are worth keeping.
            </div>

            <div className="route-how">
              <div className="route-how-row">
                <span className="route-how-k">Phone</span>
                <span className="route-how-v">
                  Google Maps → your picture → <b>Your Timeline</b> → ⋯ → <b>Location &amp; privacy
                  settings</b> → <b>Export Timeline data</b>
                </span>
              </div>
              <div className="route-how-row">
                <span className="route-how-k">Takeout</span>
                <span className="route-how-v">
                  takeout.google.com → <b>Location History (Timeline)</b> → the JSON files inside
                </span>
              </div>
            </div>

            <div className="route-note">
              The file is read here on your phone. Nothing is sent anywhere until you've seen the
              trips and ticked the ones you want.
            </div>

            {error && <div className="account-error">{error}</div>}
            <input
              ref={input}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={choose}
            />
            <button className="ios-sheet-done" onClick={() => input.current?.click()}>
              Choose the file
            </button>
          </>
        )}

        {phase === 'reading' && (
          <>
            <div className="ios-sheet-title">Reading your timeline…</div>
            <div className="ios-sheet-sub">
              Working out where home is, so the days you were away stand out from the days you
              weren't.
            </div>
          </>
        )}

        {phase === 'review' && found && (
          <>
            <div className="ios-sheet-title">
              {found.trips.length} trip{found.trips.length === 1 ? '' : 's'} in there
            </div>
            <div className="ios-sheet-sub">
              Everything more than {AWAY_KM}km from home for a night or more, between{' '}
              {fmt(found.span?.first)} and {fmt(found.span?.last)}. Untick anything that wasn't a
              trip — a hospital stay, a funeral, someone else's business.
              {found.dayTrips.length > 0 &&
                ` ${found.dayTrips.length} day trip${found.dayTrips.length === 1 ? '' : 's'} left out.`}
            </div>

            <div className="route-trips">
              {found.trips.map((t, i) => (
                <div key={i} className={`route-trip${chosen[i] ? ' on' : ''}`}>
                  <button
                    className="route-trip-tick"
                    aria-pressed={!!chosen[i]}
                    onClick={() => setChosen((c) => ({ ...c, [i]: !c[i] }))}
                  >
                    {chosen[i] ? '✓' : ''}
                  </button>
                  <div className="route-trip-body">
                    <input
                      className="route-trip-title"
                      value={titles[i] ?? ''}
                      onChange={(e) => setTitles((s) => ({ ...s, [i]: e.target.value }))}
                    />
                    <div className="route-trip-sub">{summariseTrip(t)}</div>
                    {overlaps(t) && (
                      <div className="route-trip-dup">You already have a trip over these dates</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {error && <div className="account-error">{error}</div>}
            <button className="ios-sheet-done" disabled={!picked.length} onClick={create}>
              {picked.length ? `Add ${picked.length} trip${picked.length === 1 ? '' : 's'}` : 'Pick at least one'}
            </button>
          </>
        )}

        {phase === 'saving' && (
          <>
            <div className="ios-sheet-title">
              Adding {progress.done} of {progress.total}
            </div>
            <div className="route-bar">
              <div
                className="route-bar-fill"
                style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
            <div className="ios-sheet-sub">Their day maps are coming with them.</div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="ios-sheet-title">
              {progress.done} trip{progress.done === 1 ? '' : 's'} on the globe
            </div>
            <div className="ios-sheet-sub">
              Photos, flights and notes can go on top of them whenever you like — the dates and the
              days are already there.
            </div>
            {/* Backwards is done. This is the offer to stop needing Google for
                the next one. */}
            <TrackPlaces compact />
            <button className="ios-sheet-done" onClick={onClose}>
              Have a look
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function fmt(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
