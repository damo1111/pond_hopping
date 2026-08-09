import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TrackPlaces from './TrackPlaces.jsx'
import { readExif } from '../lib/exif.js'
import { prepare, store } from '../lib/photoIngest.js'
import { savingsLabel } from '../lib/photoResize.js'
import {
  clusterPhotos,
  looksOngoing,
  slugify,
  suggestTitle,
  summarise,
} from '../lib/tripFromPhotos.js'
import SheetGrip from './SheetGrip.jsx'

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

const HEAD_BYTES = 256 * 1024

export default function StartFromPhotos({ onDone, onClose }) {
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

  async function create() {
    if (!start) return setError('Give it a start date and I can make the trip.')
    setPhase('saving')
    setError(null)
    try {
      const { data: trip, error: tripErr } = await supabase
        .from('trips')
        .insert({
          slug: slugify(title, start),
          title: title.trim() || suggestTitle(cluster),
          start_date: start,
          end_date: end || null,
          countries: [],
          status: 'confirmed',
          sort_order: 0,
        })
        .select('id,slug')
        .single()
      if (tripErr || !trip) throw tripErr || new Error('The trip could not be created.')

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
          await store(prepared, { tripId: trip.id, isHighlight: done === 0 })
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
            <button className="ios-sheet-done" onClick={create}>
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
