import { useCallback, useEffect, useRef, useState } from 'react'
import {
  asProgress,
  bringThemIn,
  howFarAlong,
  needsConsent,
  openEmptyWindow,
  rememberIntent,
  takeIntent,
} from '../lib/photoImport.js'
import { connectGooglePhotos } from '../lib/google.js'
import { track } from '../lib/analytics.js'

// The door, on the card that already admits the problem.
//
// PhotosTab has long carried a card for trips whose photographs are still in
// Google Photos, offering the one thing it could: a link out to the album.
// It was an admission, not a fix. This is the same card doing something.
//
// Deliberately not a new screen and not a source picker. Somebody adding a
// photograph they took this afternoon should still tap the ordinary upload;
// this is for the trip that happened months ago, and it sits on that trip.

/** Slow enough not to hammer the database, quick enough that a bar moves. */
const ASK_EVERY = 2000

const say = (p) => {
  if (!p) return null
  const bits = []
  if (p.done) bits.push(`${p.done.toLocaleString('en-GB')} in`)
  if (p.skipped) bits.push(`${p.skipped.toLocaleString('en-GB')} already here`)
  if (p.failed) bits.push(`${p.failed.toLocaleString('en-GB')} wouldn’t come`)
  return bits.join(' · ') || 'starting…'
}

export default function BringThemIn({ trip, onDone }) {
  const [step, setStep] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [importId, setImportId] = useState(null)
  const alive = useRef(true)

  useEffect(() => () => { alive.current = false }, [])

  // Watching, rather than doing. The work is happening on the server whether
  // or not this screen is open — which is the whole reason it is a queue —
  // so closing the app mid-import loses the progress bar and nothing else.
  useEffect(() => {
    if (!importId) return
    let stop = false
    const tick = async () => {
      try {
        const p = await howFarAlong(importId)
        if (stop || !alive.current) return
        setProgress(p)
        if (p.finished) {
          track('photos_imported', { done: p.done, skipped: p.skipped, failed: p.failed })
          onDone?.(p)
          return
        }
      } catch {
        /* a missed poll is not a failed import — try again on the next one */
      }
      if (!stop) setTimeout(tick, ASK_EVERY)
    }
    tick()
    return () => { stop = true }
  }, [importId, onDone])

  const go = useCallback(async () => {
    setError(null)
    setProgress(null)
    // Opened on the tap, before anything is awaited. Google's picker address
    // does not exist yet, and by the time it does the gesture is over — iOS
    // will not open a window outside one.
    const win = openEmptyWindow()
    track('photos_import_started')
    try {
      const { importId: id, sending, already } = await bringThemIn(trip.id, { onStep: setStep, win })
      if (!alive.current) return
      setStep(null)
      if (!id) {
        // Everything picked was already here. Not a failure, and worth saying
        // plainly rather than showing a bar that finishes instantly.
        setProgress(asProgress({ total: already, skipped: already, finished_at: new Date().toISOString() }))
        return
      }
      setImportId(id)
      setProgress(asProgress({ total: sending + already, skipped: already }))
    } catch (e) {
      if (!alive.current) return
      win?.close?.()
      setStep(null)
      if (needsConsent(e)) {
        // The token we hold was granted for the inbox, not the photographs.
        // Remembered first, because consent leaves the page and this
        // component will not exist when the answer comes back.
        rememberIntent(trip.id)
        await connectGooglePhotos()
        return
      }
      setError(e.message)
    }
  }, [trip.id])

  // Coming back from Google's consent screen.
  //
  // Asking for the photographs scope leaves the page entirely, so by the
  // time the answer arrives this component has been unmounted and rebuilt
  // and knows nothing. The intent was written down before we left; if it
  // names this trip and is recent, carry on where we stopped rather than
  // making somebody find the button again having just granted access.
  const resume = useRef(false)
  useEffect(() => {
    if (resume.current) return
    resume.current = true
    let mine = false
    try {
      const said = JSON.parse(globalThis.localStorage?.getItem('pond:importing') ?? 'null')
      mine = said?.tripId === trip.id
    } catch {
      mine = false
    }
    if (!mine) return
    // takeIntent clears it, so a reopened tab tomorrow does not start an
    // import nobody asked for.
    if (takeIntent()?.tripId === trip.id) go()
  }, [trip.id, go])

  const busy = Boolean(step) || (progress && !progress.finished)

  return (
    <div className="bring-in">
      <button className="album-open" onClick={go} disabled={busy}>
        {step ? `${step}…` : busy ? 'bringing them in…' : 'Bring them in →'}
      </button>

      {progress && (
        <div className="bring-in-progress">
          <span className="bring-in-bar">
            <span className="bring-in-bar-fill" style={{ width: `${Math.round(progress.part * 100)}%` }} />
          </span>
          <span className="bring-in-said">
            {progress.finished ? (progress.note ?? `Done — ${say(progress)}`) : say(progress)}
          </span>
        </div>
      )}

      {/* Said out loud rather than logged. An import that quietly brought in
          nine hundred of a thousand looks finished. */}
      {progress?.finished && progress.failed > 0 && (
        <span className="bring-in-note">
          {progress.failed.toLocaleString('en-GB')} couldn’t be fetched. Tap again — the ones already
          here are skipped.
        </span>
      )}

      {error && <span className="bring-in-note bring-in-note--bad">{error}</span>}
    </div>
  )
}
