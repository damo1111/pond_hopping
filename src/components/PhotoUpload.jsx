import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { HEAD_BYTES, ingest, runTotals } from '../lib/photoIngest.js'
import { readExif } from '../lib/exif.js'
import { savingsLabel } from '../lib/photoResize.js'
import { clusterPhotos, looksOngoing, slugify, suggestTitle } from '../lib/tripFromPhotos.js'
import { UNDATED, describeRow, newTripCount, planUpload, readyToUpload } from '../lib/photoPlan.js'
import Icon from './Icon.jsx'

// Adding photos used to mean pasting a URL, which assumes you had already
// uploaded them somewhere else. This takes them off the phone.
//
// Everything expensive happens before anything is sent: the file is decoded
// once, its EXIF read, and two small copies written — so what goes over the
// wire is a few hundred KB rather than the eleven megabytes a 50MP sensor
// produces. The original never leaves the device.
//
// And they go to the trip they belong to, which is new. This aimed every
// photo at whichever trip happened to be selected, silently, with no way to
// move one afterwards — so two hundred pictures on the wrong trip was
// unrecoverable, and once there are two trips called "China & Japan" it is
// also a way to publish your own photographs by accident. Now the dates are
// read first, off the phone and before anything is uploaded, and the screen
// says what it is about to do. Usually there is nothing to ask.

/**
 * Dates only: a slice of each file, no decoding and no upload. Forty photos
 * read in well under a second, which is what makes it affordable to state a
 * plan before committing to it rather than after.
 */
async function readDates(files) {
  const meta = []
  for (const f of files) {
    try {
      meta.push({ file: f, ...readExif(await f.slice(0, HEAD_BYTES).arrayBuffer()) })
    } catch {
      // Unreadable metadata is an undated photo, not a failed one.
      meta.push({ file: f })
    }
  }
  return meta
}

export default function PhotoUpload({ trip, trips = [], traveler = null, onDone }) {
  const inputRef = useRef(null)
  const [rows, setRows] = useState(null)
  const [plan, setPlan] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | reading | plan | running | done
  // Asked here rather than set once in Settings, because this is the moment
  // somebody knows the answer: these are the photographs of Japan, or they
  // are a work night in Sydney. Off unless asked — the whole point of
  // shrinking is that uploading originals on hotel wifi is miserable.
  const [keepOriginals, setKeepOriginals] = useState(false)
  const [error, setError] = useState(null)

  async function pick(e) {
    const files = [...(e.target.files || [])]
    // Chrome keeps the same input value, so re-picking the same shot after a
    // failure would otherwise silently do nothing.
    e.target.value = ''
    if (!files.length) return

    setPhase('reading')
    setError(null)
    setRows(null)
    const meta = await readDates(files)
    const { clusters, undated } = clusterPhotos(meta)
    setPlan(planUpload({ clusters, undated, trips, fallback: trip }))
    setPhase('plan')
  }

  function setRowTrip(key, value) {
    setPlan((rs) =>
      rs.map((r) =>
        r.key === key
          ? { ...r, tripId: value === '' ? null : value, unresolved: r.kind === UNDATED && value === '' }
          : r
      )
    )
  }

  // A trip made here is made the same way "Start from photos" makes one, so
  // the two doors produce the same kind of thing.
  async function createTripFor(row) {
    const c = row.route.cluster
    const title = suggestTitle(c)
    const { data, error: err } = await supabase
      .from('trips')
      .insert({
        slug: slugify(title, c.start),
        title,
        start_date: c.start,
        end_date: looksOngoing(c) ? null : c.end,
        countries: [],
        status: 'confirmed',
        sort_order: 0,
      })
      .select('id')
      .single()
    if (err || !data) throw err || new Error('The trip could not be created.')
    return data.id
  }

  async function go() {
    setPhase('running')
    setError(null)
    const all = []
    try {
      for (const row of plan) {
        const tripId = row.tripId || (await createTripFor(row))
        const files = row.photos.map((p) => p.file).filter(Boolean)
        if (!files.length) continue
        const results = await ingest(files, {
          tripId,
          traveler,
          keepOriginals,
          onProgress: (_i, _r, batch) => setRows([...all, ...batch]),
        })
        all.push(...results)
        setRows([...all])
      }
    } catch (e) {
      setError(e?.message || 'Something went wrong partway through.')
    }
    setPhase('done')
    setRows([...all])
    if (all.some((r) => r.state === 'done')) onDone?.(all)
  }

  const totals = rows ? runTotals(rows) : null
  const saving = totals?.before ? savingsLabel(totals.before, totals.after) : null
  const making = plan ? newTripCount(plan) : 0
  const ready = plan ? readyToUpload(plan) : false

  return (
    <div className="photo-upload">
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={pick} />

      {phase !== 'plan' && (
        <button
          className="pu-pick"
          disabled={phase === 'reading' || phase === 'running'}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="photo" size={16} />
          <span>
            {phase === 'reading' ? 'Reading the dates…' : phase === 'running' ? 'Adding…' : 'Add photos from this phone'}
          </span>
        </button>
      )}

      {phase === 'plan' && (
        <div className="pu-plan">
          <div className="pu-plan-title">Before I add these</div>
          {plan.map((row) => (
            <div className={`pu-plan-row${row.unresolved ? ' asking' : ''}`} key={row.key}>
              <div className="pu-plan-said">{describeRow(row, trips)}</div>
              {/* Shown for every row, not only the ones in doubt — the
                  cheapest moment to move two hundred photographs is before
                  they have gone anywhere. */}
              <select value={row.tripId ?? ''} onChange={(e) => setRowTrip(row.key, e.target.value)}>
                {row.kind === UNDATED ? (
                  <option value="">pick a trip…</option>
                ) : (
                  <option value="">a new trip</option>
                )}
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.is_demo ? `${t.title} — example` : t.title}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <label className="pu-keep">
            <input
              type="checkbox"
              checked={keepOriginals}
              onChange={(e) => setKeepOriginals(e.target.checked)}
            />
            <span>
              Keep the full-size originals
              <em>
                Held on this phone until you send them from Account. The app uploads shrunk copies
                either way.
              </em>
            </span>
          </label>

          {making > 0 && (
            <div className="pu-plan-note">
              {making === 1 ? 'One new trip will be made.' : `${making} new trips will be made.`}
            </div>
          )}

          <div className="pu-plan-buttons">
            <button className="pu-cancel" onClick={() => { setPlan(null); setPhase('idle') }}>
              Not now
            </button>
            <button className="pu-go" disabled={!ready} onClick={go}>
              {ready ? 'Add them' : 'Answer the question above'}
            </button>
          </div>
        </div>
      )}

      {/* The photographs, not their filenames.
          //
          This was a monospace list — IMG_0043.JPG … added, forty-four times
          — which is a build log about the thing rather than the thing. What
          is actually happening is worth watching: pictures arriving, most
          of them knowing where they were taken, two hundred megabytes
          becoming eighteen. So the pictures arrive, in a grid, each one
          appearing the moment it has been shrunk and filling in as it
          lands. The filenames are gone; nobody ever wanted them. */}
      {rows?.length > 0 && (
        <>
          {phase === 'running' && (
            <div className="pu-progress">
              <div className="pu-progress-said">
                {totals.done} of {rows.length}
                {totals.located > 0 && <span className="pu-progress-where"> · {totals.located} know where they were</span>}
              </div>
              <div className="pu-bar">
                <span style={{ width: `${rows.length ? (totals.done / rows.length) * 100 : 0}%` }} />
              </div>
            </div>
          )}
          <ul className="pu-grid">
            {rows.map((r, i) => (
              <li className={`pu-tile pu-${r.state}`} key={`${r.name}-${i}`} title={r.state === 'failed' ? r.error : r.name}>
                {r.preview ? (
                  <img src={r.preview} alt="" />
                ) : (
                  <span className="pu-tile-empty" aria-hidden="true" />
                )}
                {r.located && <span className="pu-pin" aria-hidden="true">◦</span>}
                {r.state === 'failed' && <span className="pu-tile-bad" aria-hidden="true">!</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <div className="pu-bad">{error}</div>}

      {phase === 'done' && totals?.done > 0 && (
        <div className="pu-summary">
          {/* The location count is the point of the whole exercise, not a
              footnote: those are the photos that can put themselves on the
              map and reconstruct where a trip went. */}
          {/* One sentence. The location count is the point of the whole
              exercise, not a footnote: those are the photographs that can
              put themselves on a map and reconstruct where a trip went. */}
          <strong>
            {totals.done} added{totals.located > 0 ? `, ${totals.located} knowing where they were` : ''}
          </strong>
          {saving && <span className="pu-saved">{saving}</span>}
          {totals.failed > 0 && <span className="pu-bad">{totals.failed} failed</span>}
        </div>
      )}
    </div>
  )
}
