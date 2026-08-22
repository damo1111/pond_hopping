import { useContext, useEffect, useRef, useState } from 'react'
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
import UploadGrid from './UploadGrid.jsx'
import EveningNote from './EveningNote.jsx'
import { oops, track } from '../lib/analytics.js'
import { farAway, spotDays, spotTrip } from '../lib/spotTrip.js'
import { homeIs } from '../lib/homeIs.js'
import { readHome } from '../lib/home.js'
import { withDeadline, ONE_PHOTO_MS } from '../lib/deadline.js'
import { whatIsNew, fingerprintOf } from '../lib/alreadyHere.js'
import {
  NEW_TRIP,
  howFarAlong,
  howItWent,
  needsConsent,
  pickFromGoogle,
  rememberIntent,
  sendThemIn,
  takeIntent,
} from '../lib/photoImport.js'
import { asDated } from '../lib/googlePhotos.js'
import { connectGooglePhotos } from '../lib/google.js'
import { WayMark } from './AuthSheet.jsx'

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
//
// Two piles, one screen.
//
// The pile on the phone is the one this was built for, and it is the wrong
// pile for the case it exists to serve. "I've already been somewhere" means
// a trip that happened — and the older the trip, the less likely its
// photographs are still on the phone. Mine were in Google Photos; so are most
// people's. Until now the only Google route was into a trip that already
// existed, which is the wrong way round: you had to invent the trip by hand
// first, and inventing it by hand is precisely the work this screen removes.
//
// So Google is a second source into the same screen, not a second screen.
// It works because the picker hands back each item's creation time at pick
// time — so the dates arrive before any bytes do, and everything after the
// choosing (cluster, name it, confirm the span, join an existing trip
// instead) is identical for both piles. What differs is only the last step:
// the phone's pile is shrunk and uploaded from here, and Google's is handed
// to the server queue, which fetches the originals without them ever
// touching the phone.


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
  const { tripMeta, notePhotosChanged } = useContext(TripContext)
  const input = useRef(null)
  const [files, setFiles] = useState(null)
  const [read, setRead] = useState(null) // { clusters, undated }
  const [pick, setPick] = useState(0)
  // Set once the offer has been answered — either way — so the form appears
  // and the question is not asked twice about the same pile.
  const [asked, setAsked] = useState(false)
  // Set when the run went up without a trip, so the last screen can say what
  // actually happened. "That's on the globe now" is a lie about a loose pile:
  // there is no card on the globe, and telling somebody to go and look at one
  // is how they conclude the app lost their photographs.
  const [keptLoose, setKeptLoose] = useState(false)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [phase, setPhase] = useState('idle') // idle | reading | confirm | saving | done
  const [progress, setProgress] = useState({ done: 0, total: 0, bytes: 0, original: 0 })
  const [error, setError] = useState(null)
  // Photographs the run gave up on, so the end can say so.
  const [missed, setMissed] = useState(0)
  // Photographs the trip already had, so nothing is sent twice.
  const [already, setAlready] = useState(0)
  // Set when the sheet goes away mid-upload. The loop checks it between
  // photographs and stops, so nothing carries on writing into a trip
  // somebody has walked away from.
  // One tile per photograph, filling in as they land. The same view the
  // in-trip uploader has always had; this door only ever showed a bar.
  const [tiles, setTiles] = useState([])
  const abandoned = useRef(false)
  useEffect(() => () => { abandoned.current = true }, [])

  // Which pile these came from. 'device' is a list of Files to shrink and
  // upload from here; 'google' is a list of picks to hand to the queue.
  // Everything between the choosing and the trip is the same either way.
  const [source, setSource] = useState('device')
  // The token proven to carry the Photos scope, kept from the pick so the
  // send is not a second chance to choose the wrong one.
  const googleKey = useRef(null)
  // Where the Google half has got to, and Google's own picker address —
  // handed out as a link rather than opened, for the reasons in bringThemIn.
  const [step, setStep] = useState(null)
  const [pickerUri, setPickerUri] = useState(null)
  const [films, setFilms] = useState(0)
  // The server queue, once it is running.
  const [queue, setQueue] = useState(null)

  // The same landing for both piles: clusters on screen, a name, a span.
  // Split out so the phone's photographs and Google's picks arrive at the
  // confirm screen by one road rather than two that drift apart.
  const land = (photos) => {
    const result = clusterPhotos(photos)
    setRead(result)
    const first = result.clusters[0]
    setPick(0)
    setTitle(suggestTitle(first))
    setStart(first?.start || '')
    setEnd(first && !looksOngoing(first) ? first.end : '')
    setPhase('confirm')
  }

  async function choose(e) {
    const picked = [...(e.target.files || [])]
    if (!picked.length) return
    setSource('device')
    setFiles(picked)
    setPhase('reading')
    setError(null)

    // Metadata only — a slice of each file, no decoding and no upload. Forty
    // photos read in well under a second, which is what lets the next screen
    // state a date range before committing to anything.
    const meta = []
    for (const f of picked) {
      try {
        const head = await f.slice(0, HEAD_BYTES).arrayBuffer()
        // Fingerprinted here, off the same slice, so that by the time
        // somebody chooses a trip we already know which of these it has.
        meta.push({ file: f, fingerprint: await fingerprintOf(head, f.size), ...readExif(head) })
      } catch {
        meta.push({ file: f })
      }
    }
    land(meta)
  }

  /**
   * Choosing in Google, with no trip yet.
   *
   * @param afterConsent  true when this run follows a trip to the consent
   *                      screen. A second refusal then is reported rather
   *                      than answered with a third trip — the loop that
   *                      cost an evening on the other door.
   */
  async function fromGoogle(afterConsent = false) {
    setSource('google')
    setPhase('google')
    setError(null)
    setPickerUri(null)
    setFilms(0)
    track('trip_from_photos_google', { after_consent: afterConsent })
    try {
      const { key, picked } = await pickFromGoogle({
        onStep: (s) => { if (!abandoned.current) setStep(s) },
        onPicker: (uri) => { if (!abandoned.current) setPickerUri(uri) },
        onFilms: (n) => { if (!abandoned.current) setFilms(n) },
      })
      if (abandoned.current) return
      googleKey.current = key
      setStep(null)
      setPickerUri(null)
      land(asDated(picked))
    } catch (e) {
      if (abandoned.current) return
      setStep(null)
      setPickerUri(null)
      if (needsConsent(e) && !afterConsent) {
        // Written down before leaving, because consent leaves the page and
        // this sheet will not exist when the answer comes back. NEW_TRIP
        // rather than a trip id: there is no trip yet, and the home screen
        // reads it as "reopen the photos route" instead of going looking for
        // one.
        rememberIntent(NEW_TRIP)
        const { error: refused } = await connectGooglePhotos()
        if (refused) {
          setPhase('idle')
          setError(`Could not reach Google’s consent screen: ${refused.message}`)
        }
        return
      }
      setPhase('idle')
      setError(
        needsConsent(e)
          ? 'Google did not grant access to your photographs. Worth trying again from your Google account settings.'
          : e?.message || 'Google Photos would not open.'
      )
    }
  }

  // Coming back from consent, on either kind of platform.
  //
  // On the web that is a fresh page load and this component is new, so the
  // intent written down before leaving is what resumes it. In the wrappers
  // there is no reload at all — the session is set in place through
  // appUrlOpen — so the same check runs again whenever the app comes
  // forward. takeIntent clears what it takes, so asking twice costs nothing.
  useEffect(() => {
    const resume = () => {
      const said = takeIntent()
      if (said?.tripId !== NEW_TRIP) return
      fromGoogle(Boolean(said.afterConsent))
    }
    resume()
    globalThis.addEventListener?.('focus', resume)
    return () => globalThis.removeEventListener?.('focus', resume)
    // Once, on mount. Re-running this on every render would spend the intent
    // repeatedly and restart the pick mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Watching the queue, not driving it.
  //
  // The work happens on the server whether or not this sheet is open, so
  // closing it loses the progress line and nothing else. A missed poll is
  // not a failed import either — the next one asks again.
  useEffect(() => {
    if (!queue?.importId) return
    let stop = false
    let shown = 0
    const tick = async () => {
      try {
        const p = await howFarAlong(queue.importId)
        if (stop || abandoned.current) return
        setQueue((q) => (q ? { ...q, progress: p } : q))
        // The grid underneath refreshes as they land, rather than once at the
        // end — a run of two hundred showed nothing at all until the last one
        // arrived, and a run that never quite finished showed nothing ever.
        if (p.done > shown) {
          shown = p.done
          notePhotosChanged?.()
        }
        if (p.finished) {
          track('photos_imported', { done: p.done, skipped: p.skipped, failed: p.failed })
          notePhotosChanged?.()
          return
        }
      } catch {
        /* a missed poll is not a failed import */
      }
      if (!stop) setTimeout(tick, 2000)
    }
    tick()
    return () => { stop = true }
  }, [queue?.importId, notePhotosChanged])

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

  // Does this pile look like a trip on its own?
  //
  // See spotTrip.js for the rule and for everything it refuses to guess at.
  // Only for the phone's pile, because Google's cannot be kept loose — the
  // server queue fetches into a trip by id and there is no id.
  //
  // Not offered when an existing trip already covers these days: "add to HK &
  // South Korea" is a better answer than "is this a trip?", and asking both at
  // once is two questions where one would do.
  const spotted =
    source === 'device' && !joinable.length
      ? spotTrip({ clusters: read?.clusters ?? [], home: homeIs(readHome()), already: tripMeta })
      : null
  const offering = Boolean(spotted && cluster && spotted.start === cluster.start && !asked)

  // `into` is an existing trip to add to; without one, a trip is made.
  /**
   * @param into   an existing trip to add to; without one, a trip is made
   * @param loose  keep the photographs without making a trip at all
   *
   * `loose` is the answer to "no, these aren't a trip". They are still the
   * person's photographs and they are still worth keeping — binning somebody's
   * pictures because they declined a suggestion would be indefensible, and it
   * teaches them never to tap No again. So the same upload runs with no trip
   * on the other end, and Photos can still show them.
   */
  async function create(into = null, { loose = false } = {}) {
    if (!loose && !into && !start) return setError('Give it a start date and I can make the trip.')
    track('trip_from_photos', { into: Boolean(into), loose })
    setKeptLoose(loose)
    setPhase('saving')
    setError(null)
    // Same reason as ingest(): making a trip and uploading forty photographs
    // into it must not be interrupted by a pending update reloading the app.
    const working = begin()
    try {
      let trip = into
      if (!trip && !loose) {
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

      // Google's pile never comes through the phone.
      //
      // The trip is made out of the dates that arrived with the pick, and
      // then the picks are handed to the server queue, which fetches the
      // originals from Google directly. Nothing is downloaded here, nothing
      // is shrunk here, and closing this sheet does not stop it — which is
      // the whole point of a queue, and why this branch watches rather than
      // works.
      // Google's pile cannot go loose: the server queue fetches into a trip
      // by id, and there is no id. Offering the choice and then ignoring it
      // would be worse than not offering it, so the offer is only shown for
      // the phone's pile — see `offering` below.
      if (source === 'google') {
        const { importId, sending, already: had } = await sendThemIn(
          trip.id,
          toUpload,
          googleKey.current
        )
        setAlready(had)
        setProgress({ done: 0, total: sending, bytes: 0, original: 0, already: had })
        notePhotosChanged?.()
        if (!importId) {
          setPhase('done')
          onDone?.(trip)
          return
        }
        setQueue({ importId, trip })
        setPhase('queued')
        onDone?.(trip)
        return
      }

      // Which of these the trip has not got.
      //
      // Picking the same camera roll twice — after a stall, or because
      // nobody was sure the first go worked — used to upload every one of
      // them again. Only worth asking when adding to a trip that already
      // exists; a trip made a moment ago holds nothing.
      let sending = toUpload
      let alreadyThere = 0
      if (into) {
        const { data: has } = await supabase
          .from('photos')
          .select('fingerprint,taken_at')
          .eq('trip_id', trip.id)
        const { fresh, already } = whatIsNew(
          toUpload.map((p) => ({ ...p, takenAt: p.takenAt ?? p.taken_at ?? null })),
          has ?? [],
        )
        sending = fresh
        alreadyThere = already
        setAlready(already)
      }

      setTiles(sending.map((p) => ({ name: p.file?.name ?? 'photo', state: 'waiting' })))

      let done = 0
      let bytes = 0
      let original = 0
      let skipped = 0
      let placed = 0
      setProgress({ done: 0, total: sending.length, bytes: 0, original: 0, already: alreadyThere })

      // Sequential on purpose here rather than the ingest helper's three at a
      // time: this screen is showing a running count, and a truthful count is
      // worth more on a first run than a few seconds.
      for (const [at, p] of sending.entries()) {
        if (abandoned.current) break
        const tile = (patch) =>
          setTiles((list) => list.map((t, i) => (i === at ? { ...t, ...patch } : t)))
        tile({ state: 'shrinking' })
        try {
          // Each photograph gets a deadline, because the way this loop failed
          // was not an exception. Somebody watched it stop at "198 of 262":
          // one of decode-and-shrink or upload never returned, and a promise
          // that never settles is not something a catch can see. Sixty-four
          // photographs behind it were never going to be tried, and nothing
          // anywhere said so.
          //
          // The abandoned work is not cancelled — it cannot be — so a photo
          // that finishes late still arrives, just uncounted. That is a much
          // smaller problem than the rest never arriving at all.
          await withDeadline(async () => {
            const prepared = await prepare(p.file)
            // The thumbnail exists before the upload starts, so the picture
            // can be on screen while the file is still going rather than
            // after it has arrived.
            tile({
              state: 'uploading',
              preview: URL.createObjectURL(prepared.thumb.blob),
              located: prepared.exif.lat != null,
            })
            await store(prepared, { tripId: loose ? null : trip.id, isHighlight: !loose && !into && done === 0 })
            bytes += prepared.display.blob.size + prepared.thumb.blob.size
            original += prepared.originalBytes
            if (prepared.exif.lat != null) placed += 1
            tile({ state: 'done' })
          }, ONE_PHOTO_MS, p.file?.name || 'a photo')
        } catch (e) {
          // One bad file does not lose the trip or the other two hundred.
          skipped += 1
          tile({ state: 'failed', error: e?.message })
          oops('photos', e, 'StartFromPhotos/upload')
        }
        setProgress({ done: ++done, total: sending.length, bytes, original, already: alreadyThere, placed })
      }

      // A trip made a moment ago that never received a single photograph is
      // not a trip. Closing the sheet part-way used to leave one behind, and
      // it then turned up in the picker on the next attempt sitting next to
      // the real one — "Trip from 12 Aug", "April 2026", "Test".
      //
      // Only when nothing landed, and only for a trip this run created. The
      // loop has already stopped by here, so nothing is racing to write into
      // what is about to be deleted.
      if (abandoned.current && !into && !loose && done === 0) {
        await supabase.from('trips').delete().eq('id', trip.id)
        return
      }

      // Said rather than silently absorbed. A run that quietly drops eleven
      // photographs looks exactly like a run that uploaded everything.
      setMissed(skipped)
      notePhotosChanged?.()
      setPhase('done')
      // Nothing to open when they are loose — there is no trip to land on,
      // which is exactly what was asked for.
      onDone?.(loose ? null : trip)
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

            {/* The other pile.
                Second rather than first, because the photographs somebody
                took this week are on the phone and that is the quicker road.
                But present, and named, because the trip this screen is *for*
                — the one that already happened — is usually the one whose
                photographs have long since left the phone. */}
            <button className="sfp-google" onClick={() => fromGoogle()}>
              <WayMark id="google" />
              <span className="sfp-google-text">
                <span className="sfp-google-name">Google Photos</span>
                <span className="sfp-google-hint">
                  Straight from Google. They never touch your phone.
                </span>
              </span>
            </button>
            {error && <div className="account-error">{error}</div>}
          </>
        )}

        {phase === 'google' && (
          <>
            <div className="ios-sheet-title">
              {pickerUri ? 'Choose them in Google' : 'Opening Google Photos…'}
            </div>
            <div className="ios-sheet-sub">
              {pickerUri
                ? 'Pick as many as you like — several holidays at once is fine. I’ll split them into trips when you’re done.'
                : step || 'One moment.'}
            </div>
            {/* A link, not something opened for them. The picker's address does
                not exist until two round trips after the tap, and by then the
                gesture that would have allowed a window has expired — so the
                only thing that works on every platform is an anchor they tap
                themselves. Polling carries on regardless. */}
            {pickerUri && (
              <a
                className="ios-sheet-done"
                href={pickerUri}
                target="_blank"
                rel="noreferrer"
              >
                Open Google Photos
              </a>
            )}
            {films > 0 && (
              <div className="ios-sheet-sub">
                {films === 1 ? 'One video stays' : `${films} videos stay`} in Google for now — I
                can’t bring films in yet.
              </div>
            )}
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
            {/* The offer, before the form.
                Somebody who has just landed and uploaded five days of
                photographs should be asked a question they can answer, not
                handed three fields. The form is still here — it is one tap
                below, and it is what anybody who wants to name it themselves
                gets. See spotTrip.js for when this is allowed to appear. */}
            {offering ? (
              <>
                <div className="ios-sheet-title">This looks like a trip</div>
                <div className="ios-sheet-sub">
                  {spotDays(spotted)} of photographs, {farAway(spotted.km)} from home.
                </div>

                <button
                  className="ios-sheet-done"
                  onClick={() => {
                    setAsked(true)
                    create()
                  }}
                >
                  Yes, make it a trip
                </button>
                <button
                  className="account-btn ghost"
                  onClick={() => {
                    setAsked(true)
                    create(null, { loose: true })
                  }}
                >
                  No, keep them loose
                </button>
                {/* Quieter than both, because it is the rarer answer and it
                    leads to work rather than away from it. */}
                <button className="route-name-it" onClick={() => setAsked(true)}>
                  I&apos;ll name it myself
                </button>
              </>
            ) : (
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
          </>
        )}

        {/* Google's pile, once the queue has it.
            Deliberately not the upload grid: there is nothing on this device
            to draw tiles from, and a grid of empty boxes would be a worse
            lie than a sentence. The trip already exists and the photographs
            are arriving into it, so leaving is genuinely safe — which the
            button says rather than implying by being enabled. */}
        {phase === 'queued' && (
          <>
            <div className="ios-sheet-title">That’s on the globe now</div>
            <div className="ios-sheet-sub">
              {howItWent(queue?.progress) ?? 'Bringing them in…'}
            </div>
            <div className="ios-sheet-sub">
              They’re coming straight from Google, so you can close this — it carries on without
              you.
            </div>
            {already > 0 && (
              <div className="ios-sheet-sub">
                {already} {already === 1 ? 'was' : 'were'} already here.
              </div>
            )}
            <TrackPlaces compact />
            <button className="ios-sheet-done" onClick={onClose}>
              Have a look
            </button>
          </>
        )}

        {phase === 'saving' && (
          <>
            <div className="ios-sheet-title">Adding them</div>
            <UploadGrid rows={tiles} done={progress.done} located={progress.placed ?? 0} />
            <div className="ios-sheet-sub">
              {savingsLabel(progress.original, progress.bytes) || 'Shrinking them as they go…'}
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="ios-sheet-title">
              {keptLoose ? 'Kept for you' : "That's on the globe now"}
            </div>
            <div className="ios-sheet-sub">
              {progress.total - missed} photos ·{' '}
              {savingsLabel(progress.original, progress.bytes) || 'uploaded'}
            </div>
            {keptLoose && (
              <div className="ios-sheet-sub">
                No trip made. They&apos;re in Photos, and they can be turned into one whenever
                you like.
              </div>
            )}
            {already > 0 && (
              <div className="ios-sheet-sub">
                {already} {already === 1 ? 'was' : 'were'} already here, so {already === 1 ? 'it' : 'they'}{' '}
                didn&apos;t go up again.
              </div>
            )}
            {missed > 0 && (
              <div className="ios-sheet-sub">
                {missed} {missed === 1 ? 'photo' : 'photos'} wouldn&apos;t go up. Choosing them
                again will only send the ones that are missing.
              </div>
            )}
            {/* If this is the trip they're on, the rest of it can log itself.
                Nothing to track when there is no trip. */}
            {!keptLoose && <TrackPlaces compact />}
            {/* And for anybody who declined that: the evening note needs
                five photographs or two kilometres, and they have just
                supplied the photographs. Renders nothing unless the
                question is still open. Not on the loose path — there is no
                trip for a day to belong to. */}
            {!keptLoose && <EveningNote />}
            <button className="ios-sheet-done" onClick={onClose}>
              Have a look
            </button>
          </>
        )}
      </div>
    </div>
  )
}
