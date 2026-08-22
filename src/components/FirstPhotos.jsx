import { useEffect, useRef, useState } from 'react'
import UploadGrid from './UploadGrid.jsx'
import { ingest, runTotals } from '../lib/photoIngest.js'
import { savingsLabel } from '../lib/photoResize.js'
import { oops, track } from '../lib/analytics.js'

// The second card, for somebody who has just said they are on a trip now.
//
// David: "when they say im on one right now, we need cards again to tell them
// what to do i think? give us your location and we will build as you plod?
// then give us pics of what youve done so far — could even just be the
// airport/plane etc?"
//
// So: location first, because it is the one thing with a deadline — the days
// nobody records are simply gone — and then this, which is the one that
// produces something to look at within about four seconds.
//
// ── Why this is not PhotoUpload ───────────────────────────────────────────
//
// PhotoUpload asks which trip each cluster belongs to, which is exactly the
// right question in the Photos tab and an absurd one here: the trip was made
// nine seconds ago and it is the only one these could possibly be. Asking
// would be the app failing to notice what it had just been told.
//
// So there is no plan step, no routing, no clustering. Everything picked goes
// into this trip. The bar to clear is one photograph — "even the plane
// window" — and every question in the way makes that less likely.

export default function FirstPhotos({ trip, onDone }) {
  const input = useRef(null)
  const previews = useRef([])
  const [rows, setRows] = useState([])
  const [phase, setPhase] = useState('idle') // idle | running | done
  const [totals, setTotals] = useState(null)
  const [error, setError] = useState(null)

  // The tiles hold blob URLs made during the run. Left alone they leak the
  // decoded bitmaps for as long as the tab lives, and on a phone that is the
  // difference between a smooth upload and a reload halfway through.
  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url)
    },
    []
  )

  async function pick(e) {
    const files = [...(e.target.files || [])]
    // Chrome keeps the same value on the input, so re-picking the same shot
    // after a failure would otherwise silently do nothing.
    e.target.value = ''
    if (!files.length) return

    setPhase('running')
    setError(null)
    track('first_photos', { count: files.length })
    try {
      const results = await ingest(files, {
        tripId: trip.id,
        onProgress: (_i, row, all) => {
          if (row?.preview) previews.current.push(row.preview)
          setRows([...all])
        },
      })
      setTotals(runTotals(results))
      setPhase('done')
    } catch (err) {
      oops('photos', err, 'FirstPhotos/ingest')
      setError(err?.message || 'That did not go up. Worth trying again.')
      setPhase('idle')
    }
  }

  if (phase === 'done') {
    const landed = totals?.done ?? 0
    return (
      <div className="track-card compact">
        <div className="track-title">
          {landed === 1 ? "That's the first one in." : `${landed} in.`}
        </div>
        <div className="track-body">
          {/* The located count rather than the file count, because that is
              the one that turns into a map without anybody typing. */}
          {totals?.located > 0
            ? `${totals.located} knew where ${totals.located === 1 ? 'it' : 'they'} were, so the map has somewhere to start.`
            : 'None of them carried a location, so the map fills in as you go.'}
          {savingsLabel(totals?.before, totals?.after)
            ? ` ${savingsLabel(totals.before, totals.after)}.`
            : ''}
        </div>
        {totals?.failed > 0 && (
          <div className="track-body">
            {totals.failed} wouldn&apos;t go up. Choosing them again only sends what&apos;s missing.
          </div>
        )}
        <button className="ios-sheet-done" onClick={onDone}>
          Have a look
        </button>
      </div>
    )
  }

  return (
    <div className="track-card compact">
      <div className="track-title">Anything from it so far?</div>
      <div className="track-body">
        One will do — the plane window, the queue at the airport, whatever&apos;s on your
        phone from today. The date and the place come out of the photograph, so the trip
        starts filling itself in straight away.
      </div>

      <UploadGrid
        rows={rows}
        done={rows.filter((r) => r.state === 'done').length}
        located={rows.filter((r) => r.state === 'done' && r.located).length}
        busy={phase === 'running'}
      />

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={pick}
      />
      <button
        className="ios-sheet-done"
        disabled={phase === 'running'}
        onClick={() => input.current?.click()}
      >
        {phase === 'running' ? 'going up…' : 'Add a photo or two'}
      </button>
      {error && <div className="account-error">{error}</div>}
      {phase !== 'running' && (
        <button className="account-btn ghost" onClick={onDone}>
          Not yet
        </button>
      )}
    </div>
  )
}
