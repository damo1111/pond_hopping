import { useCallback, useEffect, useRef, useState } from 'react'
import {
  alreadyConnected,
  alreadyTold,
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
import { openSession } from '../lib/googlePhotos.js'
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
 * The longest this is allowed to say nothing.
 *
 * Everything between the tap and the picker is network, and tonight proved
 * three separate ways for that stretch to stop without failing: a fetch that
 * never settles, a session read that never returns, a consent redirect that
 * never leaves. None of them throws, so none of them reaches the catch
 * below, and the button simply sits there — which from the outside is
 * identical to a button that is not wired up, and was reported as one twice.
 *
 * Generous, because a slow phone on a bad connection is not a fault and
 * cutting somebody off at five seconds would invent failures. But finite,
 * because "nothing happened" must stop being a state this can be in.
 */
const SAY_SOMETHING_BY = 25000

// Note what this does NOT cover: the wait for somebody to choose. That wait
// has no honest deadline — see handPicker below, where the clock is stopped
// the moment there is a picker to open.

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
  // Taking a while is not failing, and must not be said in the same voice.
  const [slow, setSlow] = useState(null)
  // Films picked but left behind, so the count is never a silent loss.
  const [films, setFilms] = useState(0)
  // null while we are still finding out; true/false once we know whether
  // Google has already been said yes to on this device.
  const [connected, setConnected] = useState(null)
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

  // Which import this watcher has already announced as finished — across
  // remounts, not just within one. See alreadyTold: onDone is a fresh
  // function on every render at one of this component's call sites, which
  // sits in this effect's own dependency array below, which means the
  // effect itself remounts on every render. A plain "have I already told
  // anybody" flag reset by that remount would just watch itself fail; a ref
  // is the one thing here that survives it.
  const toldAbout = useRef(null)

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
          // Told once per import, not once per remount of this effect.
          if (!alreadyTold(importId, toldAbout.current)) {
            toldAbout.current = importId
            track('photos_imported', { done: p.done, skipped: p.skipped, failed: p.failed })
            onDone?.(p)
          }
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
  // What a finished run does, wherever it finished from. Quick and slow have
  // to land identically — the first version had the slow path return into
  // nothing, which is how an error ended up sitting on top of a working
  // import of twelve hundred photographs.
  const land = useCallback(({ importId: id, sending, already }) => {
    if (!alive.current) return
    setStep(null)
    setPickerUri(null)
    if (!id) {
      // Everything picked was already here. Not a failure, and worth saying
      // plainly rather than showing a bar that finishes instantly.
      setProgress(asProgress({ total: already, skipped: already, finished_at: new Date().toISOString() }))
      return
    }
    setImportId(id)
    setProgress(asProgress({ total: sending + already, skipped: already }))
  }, [])

  const go = useCallback(async (from = false) => {
    const afterConsent = cameFromConsent(from)
    setError(null)
    setSlow(null)
    setFilms(0)
    setProgress(null)
    setPickerUri(null)
    track('photos_import_started')
    try {
      // Where it got to, recorded as it goes.
      //
      // Reading this back is the only way anybody has found out where this
      // stops: it fails on somebody else's phone, in an incognito window, on
      // a network nobody here can reproduce. The steps go to app_events, so
      // the session timeline on Account shows the exact point it stalled
      // instead of leaving it to be inferred from a screenshot.
      let reached = 'starting'
      const step = (s) => {
        reached = s
        setStep(s)
        track('photos_step', { step: s })
      }

      // Raced against a deadline so a silent stall becomes a sentence.
      //
      // Deliberately Promise.race and NOT withDeadline, which is the wrong
      // tool here and quietly so: withDeadline turns a rejection into its
      // fallback, and the rejections on this path are load-bearing. A 401 is
      // how "not connected to Google yet" reaches the consent branch below —
      // swallowing it into a timeout would report a stall and never send
      // anybody to Google at all, which is the exact symptom being chased.
      //
      // Race lets a throw through untouched and only adds an upper bound.
      const TIMED_OUT = Symbol('timed out')
      let clock = null
      const stall = new Promise((settle) => {
        clock = setTimeout(() => settle(TIMED_OUT), SAY_SOMETHING_BY)
      })

      // The clock stops the moment there is a picker to open.
      //
      // Everything before that point is the app talking to Google and has an
      // honest deadline. Everything after it is a person choosing
      // photographs on Google's side, and that has none: they may pick six
      // or six hundred, they may put the phone down, they may go and find
      // the trip they meant. Timing that out reports a stall against
      // somebody who is doing exactly what they were asked to do — which is
      // what it did, on a real import, within a minute of shipping.
      const handPicker = (uri) => {
        clearTimeout(clock)
        setPickerUri(uri)
      }

      // Held, so the slow path can go on waiting for the same work rather
      // than abandoning it. Racing a promise does not cancel it.
      const running = bringThemIn(trip.id, { onStep: step, onPicker: handPicker, onFilms: setFilms })
      const outcome = await Promise.race([running, stall])
      clearTimeout(clock)
      if (outcome === TIMED_OUT) {
        track('photos_step_stalled', { step: reached })
        // Deliberately NOT clearing step or pickerUri, and deliberately not
        // returning to a dead end.
        //
        // The race only stops *waiting*; the work underneath it carries on.
        // The first version cleared both and returned, so a run that was
        // merely slow got an error painted over a flow that then went on to
        // queue twelve hundred photographs perfectly well — an error and a
        // live "handing them over…" on screen at the same time, with the
        // error telling somebody to tap again and undo it.
        //
        // So: say it is taking a while, keep watching, and take the words
        // back if it arrives.
        setSlow(
          `Still on “${reached}”. It may simply be slow — nothing has been lost, and this will ` +
            'correct itself if it gets there.'
        )
        // Keep waiting for the same work. If it arrives, the warning is
        // taken back and the run is picked up exactly as if it had been
        // quick. If it throws, the catch below handles it as it always would.
        const late = await running
        if (!alive.current) return
        setSlow(null)
        return land(late)
      }
      land(outcome)
    } catch (e) {
      if (!alive.current) return
      setSlow(null)
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
  }, [trip.id, fail, land])

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

  // Get the picker ready before anybody asks for it.
  //
  // The flow was two taps every single time — "Google Photos", then "Choose
  // photographs" — and the second one is not decoration: a picker address can
  // only be *followed* by a gesture, so it has to be a real link rather than
  // something opened after an await. But nothing said the first tap had to be
  // what created the session. Google remembers the consent; only this app
  // kept asking the question again from nothing.
  //
  // So where the scope is already held, the session is opened quietly on
  // arrival and the button is a link before it is touched. One tap, straight
  // to Google, every time after the first.
  useEffect(() => {
    let dropped = false
    ;(async () => {
      try {
        const key = await alreadyConnected()
        if (dropped) return
        setConnected(Boolean(key))
        if (!key) return
        const session = await openSession(key)
        if (dropped || !session?.pickerUri) return
        setPickerUri(session.pickerUri)
      } catch {
        // Not knowing is not a failure. The button falls back to the two-tap
        // path, which is exactly what it did before any of this.
        if (!dropped) setConnected((was) => (was === null ? false : was))
      }
    })()
    return () => {
      dropped = true
    }
    // Once per card. Re-running on every progress tick would open a picker
    // session per second, which Google would rightly object to.
  }, [trip.id])

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
          Choose Google Photos →
        </a>
      ) : (
        /* Not onClick={go}. A tap is a tap, and saying so is the entire fix. */
        <button className="album-open" onClick={() => go(false)} disabled={busy}>
          {step
            ? `${step}…`
            : justBack
              ? 'Opening Google…'
              : /* Said differently depending on what it will actually do,
                   because "Google Photos" described the source rather than
                   the action and was the same words for connecting and for
                   choosing. */
                connected === false
                ? 'Connect Google Photos'
                : 'Choose Google Photos'}
        </button>
      )}

      {/* Nothing said here on purpose.
          There was a paragraph: "Google said yes. Tap above to pick the
          photographs you want — it opens on Google's side, and we bring back
          only what you choose." It sat directly under a button reading
          "Choose Google Photos →", which is the same sentence in three
          words. Two of those, plus a target line and a reassurance, stacked
          into four lines of prose above a photo grid. */}
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

      {/* Picked and not brought in. Saying nothing would read as an import
          that quietly lost things — which is exactly how "but photo didn't
          add" got reported before any of this was instrumented. */}
      {films > 0 && (
        <span className="bring-in-note">
          {films.toLocaleString('en-GB')} {films === 1 ? 'video was' : 'videos were'} left where they
          are — Pond Hopping doesn’t take video yet. Everything else is coming.
        </span>
      )}

      {/* Slow is not broken, and is not allowed to look like it. */}
      {slow && !error && <span className="bring-in-note">{slow}</span>}

      {error && <span className="bring-in-note bring-in-note--bad">{error}</span>}
    </div>
  )
}
