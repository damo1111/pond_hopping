import { useContext, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import { candidates } from '../lib/photoRouting.js'
import TrackPlaces from './TrackPlaces.jsx'
import { readExif } from '../lib/exif.js'
import { HEAD_BYTES, prepare, store } from '../lib/photoIngest.js'
import { begin } from '../lib/busy.js'
import { savingsLabel } from '../lib/photoResize.js'
import {
  clusterPhotos,
  looksOngoing,
  slugify,
  suggestTitle,
  summarise,
} from '../lib/tripFromPhotos.js'
import SheetGrip from './SheetGrip.jsx'
import { oops, track } from '../lib/analytics.js'

// "I've already been somewhere."
//
// Every other way into this app describes a trip you *booked* — a
// confirmation email, a calendar entry, an assistant reading your inbox.
// Photos are what you actually have afterwards, and they carry the two facts
// that make a trip: when, and roughly where. This turns a pile of them into a
// real trip on the globe.
//
// A trip you're on is the same import. The only difference is whether the
// last photo is recent enough that an end date would be a guess.
//
// The dates are read locally, from the first 256KB of each file, before
// anything is uploaded — so the confirm screen can be honest about what was
// found, including when the answer is "nothing", which is the normal case for
// photos that came via WhatsApp or Google Photos.


// Enough to tell two trips apart at a glance, which is the whole job of
// this line when more than one covers the same days.
function fmtSpan(t) {
  const o = { day: 'numeric', month: 'short' }
  if (!t?.start_date) return 'dates tbc'
  const a = new Date(`${t.start_date}T00:00:00`).toLocaleDateString('en-GB', o)
  if (!t.end_date) return `from ${a}`
  const b = new Date(`${t.end_date}T00:00:00`).toLocaleDateString('en-GB', { ...o, year: 'numeric' })
  return `${a} – ${b}`
}

export default function StartFromPhotos({ onDone, onClose }) {
  const { tripMeta } = useContext(TripContext)
  const input = useRef(null)
  const [files, setFiles] = useState(null)
  const [read, setRead] = useState(null) // { clusters, undated }
  const [pick, setPick] = useState(0)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [phase, setPhase] = useState('idle') // idle | reading | confirm | saving | done
  const [progress, setProgress] = useState({ done: 0, total: 0, bytes: 0, original: 0 })
  const [error, setError] = useState(null)

  async function choose(e) {
    const picked = [...(e.target.files || [])]
    if (!picked.length) return
    setFiles(picked)
    setPhase('reading')
    setError(null)

    // Metadata only — a slice of each file, no decoding and no upload. Forty
    // photos read in well under a second, which is what lets the next screen
    // state a date range before committing to anything.
    const meta = []
    for (const f of picked) {
      try {
        meta.push({ file: f, ...readExif(await f.slice(0, HEAD_BYTES).arrayBuffer()) })
      } catch {
        meta.push({ file: f })
      }
    }
    const result = clusterPhotos(meta)
    setRead(result)

    const first = result.clusters[0]
    setPick(0)
    setTitle(suggestTitle(first))
    setStart(first?.start || '')
    setEnd(first && !looksOngoing(first) ? first.end : '')
    setPhase('confirm')
  }

  const cluster = read?.clusters?.[pick] ?? null
  // Photos with no date at all still belong to the trip being made — they
  // just could not help decide when it was.
  const toUpload = cluster ? [...cluster.photos, ...(read?.undated ?? [])] : (read?.undated ?? [])

  // Trips that already cover these days.
  //
  // This screen only ever offered to make a new one. A photograph from 3
  // July, with a trip called "HK & South Korea" running 30 June to 8 July
  // sitting right there on the globe, produced a prompt to create "July
  // 2026" — the date read correctly and then the wrong question asked. The
  // other door into photos has known how to answer this since the routing
  // went in; this one was never wired to it.
  //
  // Same rules as everywhere else: examples never appear, because an
  // example carries its real trip's dates and picking wrong publishes
  // somebody's photographs.
  const joinable = cluster ? candidates(cluster, tripMeta).map((c) => c.trip) : []

  // `into` is an existing trip to add to; without one, a trip is made.
  async function create(into = null) {
    if (!into && !start) return setError('Give it a start date and I can make the trip.')
    track('trip_from_photos', { into: Boolean(into) })
    setPhase('saving')
    setError(null)
    // Same reason as ingest(): making a trip and uploading forty photographs
    // into it must not be interrupted by a pending update reloading the app.
    const working = begin()
    try {
      let trip = into
      if (!trip) {
        const row = {
          title: title.trim() || suggestTitle(cluster),
          start_date: start,
          end_date: end || null,
          countries: [],
          status: 'confirmed',
          sort_order: 0,
        }
        // Slugs are deterministic, so the same photographs picked twice ask
        // for the same one — which is exactly what happens when an upload is
        // closed part-way and started again, because the first attempt has
        // already made the trip. That surfaced as the raw Postgres text
        // `duplicate key value violates unique constraint "trips_slug_key"`
        // sitting under the button, which tells a hopper nothing and looks
        // like the app is broken.
        //
        // One retry with a tail on the slug. Not a random slug every time:
        // the trip should be allowed to be the same trip on a second go.
        let made = await supabase.from('trips').insert({ ...row, slug: slugify(title, start) })
          .select('id,slug').single()
        if (made.error?.code === '23505') {
          made = await supabase.from('trips').insert({ ...row, slug: slugify(title, start, Date.now()) })
            .select('id,slug').single()
        }
        if (made.error || !made.data) {
          oops('photos', made.error ?? new Error('no trip row'), 'StartFromPhotos/trip')
          throw new Error('That trip would not save. Worth trying again.')
        }
        trip = made.data
      }

      let done = 0
      let bytes = 0
      let original = 0
      setProgress({ done: 0, total: toUpload.length, bytes: 0, original: 0 })

      // Sequential on purpose here rather than the ingest helper's three at a
      // time: this screen is showing a running count, and a truthful count is
      // worth more on a first run than a few seconds.
      for (const p of toUpload) {
        try {
          const prepared = await prepare(p.file)
          await store(prepared, { tripId: trip.id, isHighlight: !into && done === 0 })
          bytes += prepared.display.blob.size + prepared.thumb.blob.size
          original += prepared.originalBytes
        } catch {
          // One bad file does not lose the trip or the other thirty-nine.
        }
        setProgress({ done: ++done, total: toUpload.length, bytes, original })
      }

      setPhase('done')
      onDone?.(trip)
    } catch (e) {
      setError(e?.message || 'Something went wrong making the trip.')
      setPhase('confirm')
    } finally {
      working()
    }
  }

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet route-sheet" onClick={(e) => e.stopPropagation()}>
        <SheetGrip onClose={onClose} />

        {phase === 'idle' && (
          <>
            <div className="ios-sheet-title">Start from photos</div>
            <div className="ios-sheet-sub">
              Pick the photos from a trip you've taken — or one you're on. I'll read the dates out
              of them and make the trip. They're shrunk on your phone before anything is sent, so
              it's quick even on hotel wifi.
            </div>
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={choose}
            />
            <button className="ios-sheet-done" onClick={() => input.current?.click()}>
              Choose photos
            </button>
          </>
        )}

        {phase === 'reading' && (
          <>
            <div className="ios-sheet-title">Reading {files?.length} photos…</div>
            <div className="ios-sheet-sub">Just the dates — nothing is uploaded yet.</div>
          </>
        )}

        {phase === 'confirm' && (
          <>
            <div className="ios-sheet-title">
              {cluster ? 'Does this look right?' : 'When was this trip?'}
            </div>
            <div className="ios-sheet-sub">{summarise(cluster, read?.undated?.length || 0)}</div>

            {/* Offered before the form, because it is almost always the right
                answer and the form is the fallback. Somebody who has just
                got home from a trip that is already on the globe should not
                have to make a second one to put the photographs somewhere. */}
            {joinable.length > 0 && (
              <div className="route-join">
                <div className="route-clusters-note">
                  {joinable.length === 1
                    ? 'You already have a trip covering these days:'
                    : 'These days fall inside trips you already have:'}
                </div>
                {joinable.map((t) => (
                  <button key={t.slug} className="route-join-btn" onClick={() => create(t)}>
                    <span className="route-join-title">Add to {t.title}</span>
                    <span className="route-join-sub">{fmtSpan(t)}</span>
                  </button>
                ))}
                <div className="route-join-or">or make a new one</div>
              </div>
            )}

            {read?.clusters?.length > 1 && (
              <div className="route-clusters">
                <div className="route-clusters-note">
                  These look like {read.clusters.length} separate trips. Make this one first:
                </div>
                {read.clusters.map((c, i) => (
                  <button
                    key={i}
                    className={`route-cluster${i === pick ? ' active' : ''}`}
                    onClick={() => {
                      setPick(i)
                      setTitle(suggestTitle(c))
                      setStart(c.start)
                      setEnd(looksOngoing(c) ? '' : c.end)
                    }}
                  >
                    {summarise(c)}
                  </button>
                ))}
              </div>
            )}

            <label className="route-field">
              <span>Call it</span>
              <input
                className="account-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Lisbon & Porto"
              />
            </label>
            <div className="route-dates">
              <label className="route-field">
                <span>From</span>
                <input
                  className="account-input"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label className="route-field">
                <span>To {cluster && looksOngoing(cluster) ? '(still going)' : ''}</span>
                <input
                  className="account-input"
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>

            {error && <div className="account-error">{error}</div>}
            <button className="ios-sheet-done" onClick={() => create()}>
              Make the trip · {toUpload.length} photo{toUpload.length === 1 ? '' : 's'}
            </button>
          </>
        )}

        {phase === 'saving' && (
          <>
            <div className="ios-sheet-title">
              Uploading {progress.done} of {progress.total}
            </div>
            <div className="route-bar">
              <div
                className="route-bar-fill"
                style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
            <div className="ios-sheet-sub">
              {savingsLabel(progress.original, progress.bytes) || 'Shrinking them as they go…'}
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="ios-sheet-title">That's on the globe now</div>
            <div className="ios-sheet-sub">
              {progress.total} photos ·{' '}
              {savingsLabel(progress.original, progress.bytes) || 'uploaded'}
            </div>
            {/* If this is the trip they're on, the rest of it can log itself. */}
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
