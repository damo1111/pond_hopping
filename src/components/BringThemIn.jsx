import { useCallback, useEffect, useRef, useState } from 'react'
import {
  asProgress,
  bringThemIn,
  cameFromConsent,
  howFarAlong,
  howItWent,
  needsConsent,
  rememberIntent,
  googleTokens,
  tokenFacts,
  stillRefused,
  takeIntent,
} from '../lib/photoImport.js'
import { connectGooglePhotos, whatWeAsked } from '../lib/google.js'
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

/**
 * Which build said it.
 *
 * A message copied out of the app and pasted back is the only evidence there
 * is about this feature, and twice now an identical one arrived from two
 * different builds — a fix and the build it replaced read exactly alike, and
 * the second reading cost a round of debugging a defect that was already
 * gone. A service worker that hands back yesterday's bundle is normal and
 * invisible; the stamp is what makes it visible.
 */
const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

export default function BringThemIn({ trip, onDone }) {
  const [step, setStep] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  // Every failure carries the build that produced it. See BUILD above.
  const fail = useCallback((msg) => setError(`${msg} · build ${BUILD}`), [])
  const [importId, setImportId] = useState(null)
  // Google's picker address, once there is one. Rendered as a link rather
  // than opened, because a delayed window.open is refused — see below.
  const [pickerUri, setPickerUri] = useState(null)
  // Only affects what the button says while it works — see tryResume below.
  const [justBack, setJustBack] = useState(false)
  const alive = useRef(true)

  useEffect(() => () => { alive.current = false }, [])

  // Watching, rather than doing. The work is happening on the server whether
  // or not this screen is open — which is the whole reason it is a queue —
  // so closing the app mid-import loses the progress bar and nothing else.
  useEffect(() => {
    if (!importId) return
    let stop = false
    // What the grid has already been told about. Photographs are the point,
    // and they were only ever asked for once, at the very end — so a run that
    // brought in two hundred showed nothing at all until the last one landed,
    // and a run that never quite finished showed nothing ever.
    let shown = 0
    const tick = async () => {
      try {
        const p = await howFarAlong(importId)
        if (stop || !alive.current) return
        setProgress(p)
        if (p.done > shown) {
          shown = p.done
          // Refreshes the grid underneath. They arrive as they arrive.
          onDone?.(p)
        }
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

  // `afterConsent` is true only when this run is the one that follows a trip
  // to Google's consent screen. It is the whole guard against the loop — and
  // for a week it was also the reason consent never happened at all.
  //
  // This was wired straight onto the button as onClick={go}, and React hands
  // a click handler its event. So every tap arrived as go(SyntheticEvent) —
  // an object, therefore truthy, therefore "you have already been to Google".
  // The first refusal was reported as the second, the consent screen was
  // never opened, and the report said "we asked for: unrecorded" because
  // nothing had ever been asked. Five separate causes were proposed for the
  // missing scope over two evenings and the request was never made.
  //
  // cameFromConsent is deliberately strict about what counts, and the button
  // below says what it means rather than handing over whatever it is given.
  const go = useCallback(async (from = false) => {
    const afterConsent = cameFromConsent(from)
    setError(null)
    setProgress(null)
    setPickerUri(null)
    track('photos_import_started')
    try {
      const { importId: id, sending, already } = await bringThemIn(trip.id, {
        onStep: setStep,
        onPicker: setPickerUri,
      })
      if (!alive.current) return
      setStep(null)
      if (!id) {
        // Everything picked was already here. Not a failure, and worth saying
        // plainly rather than showing a bar that finishes instantly.
        setPickerUri(null)
        setProgress(asProgress({ total: already, skipped: already, finished_at: new Date().toISOString() }))
        return
      }
      setImportId(id)
      setPickerUri(null)
      setProgress(asProgress({ total: sending + already, skipped: already }))
    } catch (e) {
      if (!alive.current) return
      setPickerUri(null)
      setStep(null)
      if (needsConsent(e)) {
        // Refused once: the token we hold was granted for the inbox, not the
        // photographs. Remembered first, because consent leaves the page and
        // this component will not exist when the answer comes back.
        //
        // Refused *twice*, with a consent screen in between, means asking a
        // third time would be a loop — which is exactly what this used to do,
        // silently, forever. Somebody who has just granted access and is sent
        // straight back to grant it again has no way to tell that anything is
        // wrong, let alone what.
        if (!afterConsent) {
          rememberIntent(trip.id)
          // Said out loud rather than dropped. This returns {error} and the
          // return was ignored, so a consent screen that could not be reached
          // looked exactly like a tap that did nothing — on the one path where
          // "nothing happened" was the entire symptom being chased.
          const { error: refused } = await connectGooglePhotos()
          if (refused) fail(`Could not reach Google’s consent screen: ${refused.message}`)
          return
        }
        // Ask Google what the token it just issued actually carries, rather
        // than theorising about why it was refused. Two wrong answers came
        // out of theorising.
        // Reported on the token the import actually chose, not on whichever
        // one a different function would have picked. freshToken prefers the
        // live session, so the message described the sign-in token while the
        // import had been weighing both — two answers to one question, and
        // the one on screen was the wrong one.
        fail(stillRefused(e, await tokenFacts((await googleTokens())[0]), whatWeAsked()))
        return
      }
      fail(e.message)
    }
  }, [trip.id, fail])

  // Coming back from Google's consent screen.
  //
  // Which happens two different ways, and only one of them was handled.
  //
  // On the web, consent leaves the page and returns as a fresh load: this
  // component is unmounted, rebuilt, and knows nothing, so it reads the
  // intent written down before we left. That worked.
  //
  // In the wrappers there is no fresh load at all. Consent goes out to the
  // system browser and comes back through Capacitor's appUrlOpen, which sets
  // the session *in place* — same page, same React tree, same mounted
  // component with its resume already spent. So somebody granted access,
  // landed back on the identical screen, and nothing whatsoever happened.
  // Which is exactly what it looked like.
  //
  // So this listens as well as running once. takeIntent clears what it
  // takes, so asking again on every return is free: the first one that finds
  // something acts, and every later one finds nothing.
  const tryResume = useCallback(() => {
    let mine = false
    try {
      const said = JSON.parse(globalThis.localStorage?.getItem('pond:importing') ?? 'null')
      mine = said?.tripId === trip.id
    } catch {
      mine = false
    }
    if (!mine) return
    const said = takeIntent()
    if (said?.tripId !== trip.id) return
    // An "after consent" intent is only written in the breath before leaving
    // for Google, and leaving for Google writes the request down in *session*
    // storage. Both should be here together. When the intent is here and the
    // request is not, this tab never went anywhere — the intent is a leftover
    // from a previous browser session, and localStorage outlives those while
    // sessionStorage does not.
    //
    // Resuming on one of those is worse than doing nothing: it goes straight
    // to a refusal and then reports on a request that was never made.
    if (said.afterConsent && whatWeAsked() === null) return
    setJustBack(true)

    // Carry on. The tap this used to wait for was only ever there to satisfy
    // a popup blocker, and there is no popup left to block: the picker is a
    // link now, and a link can be rendered without a gesture. It only needs
    // one to be followed, which is the tap somebody was always going to make.
    go(true)
  }, [trip.id, go])

  useEffect(() => {
    tryResume()
    const onBack = () => tryResume()
    // Both, because the two wrappers and the two browsers do not agree on
    // which one fires when an app is brought forward.
    globalThis.addEventListener?.('focus', onBack)
    globalThis.document?.addEventListener?.('visibilitychange', onBack)
    return () => {
      globalThis.removeEventListener?.('focus', onBack)
      globalThis.document?.removeEventListener?.('visibilitychange', onBack)
    }
  }, [tryResume])

  const busy = Boolean(step) || (progress && !progress.finished)

  return (
    <div className="bring-in">
      {/* One control, always in the same place.
          The link used to appear *below* a button that had gone quiet, so
          finishing the consent trip meant tapping the button, watching
          nothing obvious happen, and then noticing a second thing further
          down. Two taps, two places. Now the button becomes the link. */}
      {pickerUri ? (
        <a
          className="album-open album-open--ready"
          href={pickerUri}
          target="_blank"
          rel="noreferrer"
          onClick={() => track('photos_picker_opened')}
        >
          Choose photographs →
        </a>
      ) : (
        /* Not onClick={go}. A tap is a tap, and saying so is the entire fix. */
        <button className="album-open" onClick={() => go(false)} disabled={busy}>
          {step ? `${step}…` : justBack ? 'Opening Google…' : 'Google Photos'}
        </button>
      )}

      {progress && (
        <div className="bring-in-progress">
          <span className="bring-in-bar">
            <span className="bring-in-bar-fill" style={{ width: `${Math.round(progress.part * 100)}%` }} />
          </span>
          <span className="bring-in-said">
            {(progress.finished && progress.note) || howItWent(progress)}
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
