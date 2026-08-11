import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase.js'
import { spanOf } from '../lib/dateRange.js'
import { summaryOf } from '../lib/tripSummary.js'
import { asDegrees, tripAverage, tripSky } from '../lib/weather.js'
import { forRecap, nextTurn } from '../lib/recapPhotos.js'
import { useWeather } from '../lib/useWeather.js'
import { coverUrl, thumb } from '../lib/imgTransform.js'
import { recapStats } from '../lib/tripRecap.js'
import { tripColor } from '../lib/tripColors.js'
import { siteOrigin } from '../lib/siteOrigin.js'
import { SheetContext } from '../lib/sheetContext.js'
import { beginDrag, extendDrag, finishDrag } from '../lib/sheetDrag.js'
import { gather } from '../lib/gather.js'
import { record as debug, clear as clearDebug, read as readDebug, isOn as debugOn, subscribe as onDebug } from '../lib/gestureDebug.js'
import CountryFlags from './CountryFlags.jsx'
import GmailImport from './planner/GmailImport.jsx'
import Icon from './Icon.jsx'

// Lazy so the recap doesn't drag four tab views — and Leaflet — into the
// Home chunk for the many opens where nobody taps a figure.
const JournalTab = lazy(() => import('../tabs/JournalTab.jsx'))
const PhotosTab = lazy(() => import('../tabs/PhotosTab.jsx'))
const MapTab = lazy(() => import('../tabs/MapTab.jsx'))
const FlightsTab = lazy(() => import('../tabs/FlightsTab.jsx'))
const RunsPanel = lazy(() => import('./RunsPanel.jsx'))

// Fetching a 300KB chunk while a sheet is sliding up is a stall you can feel:
// the animation is competing with a parse. Warm them once the recap has
// settled and is doing nothing, so opening one is only a render.
const WARM = [
  () => import('../tabs/JournalTab.jsx'),
  () => import('../tabs/PhotosTab.jsx'),
  () => import('../tabs/FlightsTab.jsx'),
  () => import('./RunsPanel.jsx'),
  () => import('../tabs/MapTab.jsx'),
]

const LAYERS = {
  journal: { title: 'Journal', View: JournalTab },
  photos: { title: 'Photos', View: PhotosTab },
  map: { title: 'Map', View: MapTab },
  flights: { title: 'Flights', View: FlightsTab },
  // Titled from the data — see sport.js. Somebody whose activities are
  // walks should not be reading a heading that says Runs.
  runs: { title: 'Runs', View: RunsPanel },
}

// Shown over the first few recaps and then never again — long enough to
// teach that the numbers are the navigation, short of nagging.
const HINT_KEY = 'ph_recap_hint_seen'
const HINT_TIMES = 3

// A trip, in one page.
//
// The trip summary used to be a card pinned to the top of the journal
// forever, which is the least interesting form it could take. The
// convention that has actually landed in consumer apps — Wrapped, Year in
// Sport, Memories — is that a recap is a *moment*: full-screen, arriving
// when something ends, and built to be sent to somebody. This is that,
// assembled from rows the app already has rather than from anything new.

const fmtRange = (t) => spanOf(t, { long: true })

// Switched on from Account, off for everyone else. Shows what the sheet's
// drag actually received on the device it is running on, because three
// rounds of reasoning about Android's WebView from a desktop browser got the
// wrong answer three times.
function GestureReadout() {
  const [, bump] = useState(0)
  useEffect(() => onDebug(() => bump((n) => n + 1)), [])
  if (!debugOn()) return null
  const lines = readDebug()
  return (
    <div className="gesture-readout">
      {lines.length ? lines.map((l, i) => <div key={i}>{l}</div>) : <div>drag the sheet…</div>}
    </div>
  )
}

export default function TripRecap({ trip, cover, reveal = true, origin = null, onLoaded, onClose }) {
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)
  // What to say when sharing could not happen. Never nothing.
  const [shareNote, setShareNote] = useState(null)
  // Which sub-view is open over the recap. The recap itself stays mounted
  // underneath, so closing this comes back here rather than dumping you on
  // a tab with no way back — which is what tapping a figure used to do.
  const [layer, setLayer] = useState(null)
  // Which photograph the sheet should open on, when it was a photograph
  // rather than a figure that was tapped. Separate from `layer` because the
  // layer name keys the view, the title and three classnames.
  const [layerPhoto, setLayerPhoto] = useState(null)
  // The frosted pane is the expensive part: blurring a backdrop that is
  // itself mid-animation costs a full re-blur every frame, on a phone, at
  // exactly the moment the sheet needs those frames. So the sheet rises
  // over a flat surface and only goes frosted once it has arrived.
  const [settled, setSettled] = useState(false)
  const [hint, setHint] = useState(false)
  // A cover URL that 404s. Google Photos share links do, eventually.
  const [coverBroke, setCoverBroke] = useState(false)
  // Whether the link would work for anybody else. Held locally as well as
  // on the trip so the screen updates the moment it changes — the trip
  // object comes from Home's list, which does not know this happened.
  const [isPublic, setIsPublic] = useState(trip?.is_public !== false)
  const [askPublic, setAskPublic] = useState(false)
  const [findingBookings, setFindingBookings] = useState(false)
  // Which turn through the starred photographs this opening gets.
  const [turn] = useState(() => nextTurn(trip?.id))
  const [publishing, setPublishing] = useState(false)
  // How far the sheet has been pulled down, in px. The handle was drawn as an
  // affordance the sheet didn't honour: it looks like something you can pull,
  // so on the web a downward drag went to the browser's pull-to-refresh
  // instead. Now the sheet takes the gesture.
  const [drag, setDrag] = useState(0)
  const dragRef = useRef(null)
  const bodyRef = useRef(null)
  const sheetRef = useRef(null)
  // The recap itself — the page under the sheets. It had a close button and
  // nothing else: no handle, no gesture. Every fix to "the drag doesn't work"
  // has been to the sheets, which is the wrong screen if this is the one
  // being pulled.
  const recapRef = useRef(null)
  const scrollRef = useRef(null)
  const recapGesture = useRef(null)
  const [recapDrag, setRecapDrag] = useState(0)

  useEffect(() => {
    setSettled(false)
    setDrag(0)
  }, [layer])

  // ── One gesture, fed by whichever events the engine actually sends ────────
  //
  // A finger on Android produces pointer events *and* touch events, and each
  // family can fail in a way the other doesn't. Pointer events get cancelled
  // the moment the browser decides a vertical drag is a scroll. Touch events
  // survive that, but only a non-passive touchmove can call preventDefault,
  // and an engine that has already begun scrolling ignores it.
  //
  // So neither is trusted alone. Both feed one gesture object, and every
  // operation on it is idempotent — two sources reporting the same finger at
  // the same place reach the same answer, and only the first ending decides.
  //
  // The decision itself is in sheetDrag.js, with tests. It belongs there
  // because the version that lived here was wrong three times running while
  // every browser test passed: the case that was broken — the engine
  // claiming the gesture and firing a cancel mid-pull — is not something a
  // synthetic finger can be made to do.
  const gesture = dragRef

  function begin(y, t, target, sawTouch) {
    const g = gesture.current
    // Already tracking this same finger from the other event family.
    if (g && Math.abs(g.y - y) < 2) { g.sawTouch = g.sawTouch || sawTouch; return }
    const next = beginDrag({
      y, t,
      inBody: !!bodyRef.current?.contains(target),
      scrollTop: bodyRef.current?.scrollTop || 0,
    })
    if (next) next.sawTouch = sawTouch
    gesture.current = next
  }

  // Returns true when the gesture is ours, which is the caller's cue to take
  // the event away from the browser.
  function extend(y, t) {
    const sawTouch = gesture.current?.sawTouch
    const { state, drag: d, mine } = extendDrag(gesture.current, { y, t })
    if (state) state.sawTouch = sawTouch
    gesture.current = state
    if (d !== null) setDrag(d)
    return mine
  }

  function finish(endY) {
    const g = gesture.current
    gesture.current = null
    const verdict = finishDrag(g, endY)
    if (verdict === 'close') setLayer(null)
    else if (verdict === 'spring') setDrag(0)
  }

  // Listened for on the document, in the capture phase, and hit-tested
  // against the sheet's own rectangle.
  //
  // Attaching to the sheet element and trusting e.target is what this used to
  // do, and it made the drag depend on three things that turned out not to
  // hold on a real phone: that the listener was on the element the thumb
  // landed on, that nothing between them stopped propagation, and that the
  // node the ref pointed at was the node being touched. Capture on the
  // document depends on none of that — it is the first thing to see every
  // touch on the page, and geometry cannot be wrong about where a finger is.
  useEffect(() => {
    if (!layer) return

    const inSheet = (y, x) => {
      const el = sheetRef.current
      if (!el) return false
      const r = el.getBoundingClientRect()
      return y >= r.top && y <= r.bottom && x >= r.left && x <= r.right
    }

    const onStart = (e) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (!inSheet(t.clientY, t.clientX)) return
      clearDebug()
      debug(`touchstart y=${Math.round(t.clientY)} on ${e.target?.className || e.target?.tagName}`)
      begin(t.clientY, e.timeStamp, e.target, true)
    }
    const onMove = (e) => {
      // Every touch on the page reaches here now, so leave early unless one
      // of ours is actually in flight.
      if (!gesture.current || !e.touches.length) return
      const y = e.touches[0].clientY
      const dy = Math.round(y - gesture.current.y)
      const mine = extend(y, e.timeStamp)
      debug(`touchmove dy=${dy} mine=${mine} cancelable=${e.cancelable}`)
      if (mine && e.cancelable) e.preventDefault()
    }
    const endY = (e) => e.changedTouches?.[0]?.clientY
    const onEnd = (e) => {
      if (!gesture.current) return
      debug(`touchend y=${Math.round(endY(e) ?? -1)}`)
      finish(endY(e))
    }
    // I previously sprang back here, on the reasoning that a cancelled
    // gesture is not a decision. That was wrong, and it is why the handle
    // stayed broken on a real phone through two rounds of fixes: Android's
    // WebView claims the drag and fires touchcancel *mid-pull*, so a
    // deliberate 150px haul down the sheet was being thrown away. Desktop
    // Chromium never cancels once the bar is touch-action: none, so every
    // test passed against a bug that only existed on the device.
    //
    // A cancel after a long downward pull is a decision. Judge it on the
    // distance like any other ending.
    const onCancel = (e) => {
      if (!gesture.current) return
      debug(`touchCANCEL y=${Math.round(endY(e) ?? -1)}`)
      finish(endY(e))
    }

    const cap = { capture: true, passive: false }
    document.addEventListener('touchstart', onStart, { capture: true, passive: true })
    document.addEventListener('touchmove', onMove, cap)
    document.addEventListener('touchend', onEnd, cap)
    document.addEventListener('touchcancel', onCancel, cap)
    return () => {
      document.removeEventListener('touchstart', onStart, true)
      document.removeEventListener('touchmove', onMove, true)
      document.removeEventListener('touchend', onEnd, true)
      document.removeEventListener('touchcancel', onCancel, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer])

  function onPointerDown(e) {
    begin(e.clientY, e.timeStamp, e.target, false)
  }

  function onPointerMove(e) {
    if (extend(e.clientY, e.timeStamp)) e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onPointerUp(e) {
    finish(e.clientY)
  }

  // The browser cancels the pointer stream as soon as it claims the drag as a
  // scroll. If touch events are also feeding this gesture they are still live,
  // so let the touch side finish it — otherwise judge it on the distance, the
  // same as any other ending.
  function onPointerCancel(e) {
    debug(`pointercancel y=${Math.round(e.clientY)} sawTouch=${!!gesture.current?.sawTouch}`)
    if (gesture.current?.sawTouch) return
    finish(e.clientY)
  }

  // The card's centre relative to the screen's, which is what the opening
  // animation travels along. Falls back to a plain scale-up from the middle
  // when we don't know where the tap came from — a deep link, or the recap
  // reached any way other than by pressing a card.
  const originVars = origin
    ? {
        '--recap-ox': `${Math.round(origin.left + origin.width / 2 - window.innerWidth / 2)}px`,
        '--recap-oy': `${Math.round(origin.top + origin.height / 2 - window.innerHeight / 2)}px`,
      }
    : undefined

  // Pull the whole recap down to close it, on the same terms as the sheets
  // and through the same tested decision — see sheetDrag.js. Only when no
  // sheet is open over the top, and only from the top of the page, so it
  // never competes with reading.
  useEffect(() => {
    if (layer || !reveal) return

    const inRecap = (y, x) => {
      const el = recapRef.current
      if (!el) return false
      const r = el.getBoundingClientRect()
      return y >= r.top && y <= r.bottom && x >= r.left && x <= r.right
    }

    const onStart = (e) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (!inRecap(t.clientY, t.clientX)) return
      recapGesture.current = beginDrag({
        y: t.clientY,
        t: e.timeStamp,
        inBody: !!scrollRef.current?.contains(e.target),
        scrollTop: scrollRef.current?.scrollTop || 0,
      })
    }
    const onMove = (e) => {
      if (!recapGesture.current || !e.touches.length) return
      const { state, drag: d, mine } = extendDrag(recapGesture.current, {
        y: e.touches[0].clientY,
        t: e.timeStamp,
      })
      recapGesture.current = state
      if (d !== null) setRecapDrag(d)
      if (mine && e.cancelable) e.preventDefault()
    }
    const end = (e) => {
      if (!recapGesture.current) return
      const g = recapGesture.current
      recapGesture.current = null
      const verdict = finishDrag(g, e.changedTouches?.[0]?.clientY)
      if (verdict === 'close') onClose?.()
      else if (verdict === 'spring') setRecapDrag(0)
    }

    const cap = { capture: true, passive: false }
    document.addEventListener('touchstart', onStart, { capture: true, passive: true })
    document.addEventListener('touchmove', onMove, cap)
    document.addEventListener('touchend', end, cap)
    document.addEventListener('touchcancel', end, cap)
    return () => {
      document.removeEventListener('touchstart', onStart, true)
      document.removeEventListener('touchmove', onMove, true)
      document.removeEventListener('touchend', end, true)
      document.removeEventListener('touchcancel', end, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, reveal])

  // Once the recap is actually up and idle, pull the sheet chunks in the
  // background. Not before: while it's still hidden the globe is flying, and
  // parsing 300KB of Leaflet is the last thing that flight needs.
  useEffect(() => {
    if (!reveal) return
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200))
    const id = idle(() => WARM.forEach((load) => load()))
    return () => window.cancelIdleCallback?.(id)
  }, [reveal])

  useEffect(() => {
    if (!reveal) return
    const seen = Number(localStorage.getItem(HINT_KEY) || 0)
    if (seen >= HINT_TIMES) return
    localStorage.setItem(HINT_KEY, String(seen + 1))
    const show = setTimeout(() => setHint(true), 1100)
    const hide = setTimeout(() => setHint(false), 6600)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [reveal])

  // Six queries, and every figure on the page used to wait on all six.
  //
  // Promise.all, no catch, no timeout: one request that stalled or was
  // refused and `data` stayed null forever. The screen that opens the recap
  // does not wait for it — it reveals after OPEN_MAX_MS whatever happens —
  // so a nine-day trip with four flights, nine days written up and five
  // runs opened saying "9 days away" and nothing else. Not an error and not
  // a spinner: a finished-looking page missing five of its six numbers, and
  // with them every way in, because on this page the figures *are* the
  // navigation. Flights, map, journal, runs and photos all became
  // unreachable because one unrelated request had not come back.
  //
  // gather() is that shape fixed and tested: each answer stands alone, one
  // that never returns costs one figure, and there is a grace period so a
  // quick connection still opens on something finished.
  useEffect(() => {
    if (!trip?.id) return
    setCoverBroke(false)
    setIsPublic(trip.is_public !== false)
    setAskPublic(false)
    return gather(
      [
        {
          query: supabase
            .from('flights')
            .select('distance_km,dep_airport,arr_airport,dep_city,arr_city,dep_time')
            .eq('trip_id', trip.id)
            .eq('status', 'flown'),
          take: (f) => ({ flights: f.data ?? [] }),
        },
        {
          query: supabase.from('journal_entries').select('city,entry_date,title').eq('trip_id', trip.id),
          take: (e) => ({ entries: e.data ?? [] }),
        },
        {
          query: supabase.from('runs').select('distance_km').eq('trip_id', trip.id),
          take: (r) => ({ runs: r.data ?? [] }),
        },
        {
          // thumb_url is a stored, already-rendered file; thumb() builds a
          // URL against Supabase's on-the-fly transform endpoint. Asking
          // that endpoint for twelve renders at once is what broke the
          // grid, which is why PhotosTab has always preferred the stored
          // one. 500 of the 504 rows have one; the transform is the
          // fallback, not the default.
          //
          // Highlights first, so the recap leads with the good ones rather
          // than the first twelve that happened to be inserted.
          query: supabase
            .from('photos')
            /* id so tapping one can open the sheet on that row rather than
               at the top of the grid. */
            .select('id,url,thumb_url,caption,is_highlight,taken_on')
            .eq('trip_id', trip.id)
            .neq('kind', 'receipt')
            // nullsFirst matters now that undecided is null: the default
            // for a descending order is nulls first, which would put every
            // photograph nobody chose ahead of the ones they did.
            .order('is_highlight', { ascending: false, nullsFirst: false })
            .order('taken_on', { ascending: true })
            // More than fits, because starring the thirteenth photograph
            // used to do nothing at all — the twelve were chosen at the
            // database and the rest were never fetched. See recapPhotos.js.
            .limit(120),
          take: (p) => ({ photos: p.data ?? [] }),
        },
        {
          query: supabase.from('trip_summaries').select('summary').eq('trip_id', trip.id).maybeSingle(),
          take: (s) => ({ cached: s.data ?? null }),
        },
        {
          // The written story's closing is the trip looked back on, from the
          // photographs as well as the entries. Where there is one it is
          // what this page says, so enriching the story enriches the cover
          // — with nothing to invalidate and no second call to make.
          query: supabase.from('trip_stories').select('closing').eq('trip_id', trip.id).maybeSingle(),
          take: (s) => ({ story: s.data ?? null }),
        },
        {
          // Where each day was, for the weather. Four numbers a row, and it
          // has to be its own query rather than reusing the twelve above:
          // those are ordered by what somebody chose, so a fortnight's trip
          // could be represented by three days of it and the rest would
          // never get a temperature.
          query: supabase
            .from('photos')
            .select('taken_on,taken_at,lat,lon')
            .eq('trip_id', trip.id)
            .not('lat', 'is', null),
          take: (p) => ({ coords: p.data ?? [] }),
        },
        {
          query: supabase.from('profiles').select('temp_unit').maybeSingle(),
          take: (p) => ({ unit: p.data?.temp_unit || 'device' }),
        },
        {
          // The strip is twelve; the figure has to be all of them. Counting
          // the twelve gave "12 photos" for a trip with 181. A head request
          // costs one round trip and no rows.
          query: supabase.from('photos').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id).neq('kind', 'receipt'),
          take: (n) => ({ photoCount: n.count ?? null }),
        },
      ],
      {
        onSlice: (slice) => setData((d) => ({ ...(d ?? {}), ...slice })),
        // Says the page is worth showing. The opener waits on this rather
        // than on a fixed delay, so a fast connection opens as soon as
        // there is something to open and a slow one is not held hostage by
        // a guess.
        onReady: () => onLoaded?.(),
        // Somewhere findable, rather than nowhere. Every one of these used
        // to vanish into a Promise.all that simply never resolved.
        onTrouble: (why) => console.warn('[recap]', trip.slug, why),
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id])

  // Locked while this is open — it's a full-screen moment, and having the
  // journal scroll along underneath it breaks that completely.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Filled here rather than only read here. Leaving it to the journal meant
  // the front page of a trip had no temperature on it until somebody had
  // been into the days one by one, which is not a thing anybody does before
  // showing a trip to somebody else.
  //
  // Above the early return, because it is a hook: the linter caught this
  // sitting below `if (!trip) return null`, where it would have run on some
  // renders and not others.
  const weather = useWeather(trip?.id, data?.coords ?? [])

  if (!trip) return null

  const stats = recapStats({ trip, ...(data ?? {}) })
  const days = Object.values(weather)

  const summary = summaryOf(data?.story, data?.cached)
  // The trip in one temperature: the mean of the days' highs, which is a
  // statement about afternoons — when anybody was outside in it.
  const warmth = asDegrees(tripAverage(days), data?.unit ?? 'device')
  const skies = tripSky(days)
  // Twelve of them, rotated where somebody starred more. Decided once per
  // opening rather than per render: a grid that reshuffles while you are
  // looking at it is worse than one that never changes.
  const shown = forRecap(data?.photos, turn)

  // The cover, in order of how much it is really this trip's: one chosen
  // deliberately, then the best of its own photographs, then none.
  //
  // "None" used to be a black rectangle, which is what a trip with no
  // photos looks like today and what every trip will look like the moment a
  // scraped Google Photos link expires — and they do expire. The hero
  // already had a gradient built out of the trip's accent underneath the
  // image; it was simply never allowed to show, and the scrim written for a
  // photograph sat on top of it and took it down to near-black. So a
  // coverless trip now gets that gradient properly, and a cover that fails
  // to load falls through to it rather than leaving a hole.
  const chosen = cover || data?.photos?.[0]?.thumb_url || data?.photos?.[0]?.url || null
  const hero = coverBroke ? null : chosen

  // Two ways this did nothing, both silently.
  //
  // navigator.share exists inside the iOS web view and does not always
  // work there. Every failure went into an empty catch, so a share sheet
  // that refused to open was indistinguishable from a button that was not
  // wired up — which is what it looked like. Cancelling is the one refusal
  // that means "I changed my mind"; everything else falls through to the
  // clipboard, and a clipboard that isn't there says so rather than
  // claiming a link was copied when nothing was.
  //
  // And the link itself only works if the trip is public. A private one
  // hands somebody a page that shows them nothing, which is worse than
  // refusing: they think you shared it and you think they saw it.
  //
  // "Make it public first" was a dead end. It named the obstacle and then
  // left you holding it — and there is nowhere else in the app to make a
  // trip public, so the instruction could not be followed at all. The only
  // honest options are to offer it here or to stop claiming it is possible.
  async function share() {
    if (!isPublic) {
      // Somebody else's trip: say who can, rather than offering a button
      // that will be refused by the database a second later.
      if (trip.owned === false) {
        setShareNote('Only the person whose trip this is can make it public.')
        setTimeout(() => setShareNote(null), 6000)
        return
      }
      setAskPublic(true)
      return
    }
    return doShare()
  }

  // Publishing is the part worth pausing on: it is the one action here that
  // changes who can see somebody's holiday. So it is asked rather than
  // assumed, says plainly what it does, and can be undone from the same
  // screen afterwards — a door that only opens one way is not a choice.
  async function makePublicAndShare() {
    setPublishing(true)
    const { error } = await supabase.from('trips').update({ is_public: true }).eq('id', trip.id)
    setPublishing(false)
    if (error) {
      setAskPublic(false)
      setShareNote(`Couldn't make it public: ${error.message}`)
      setTimeout(() => setShareNote(null), 8000)
      return
    }
    setIsPublic(true)
    setAskPublic(false)
    return doShare()
  }

  async function makePrivate() {
    setPublishing(true)
    const { error } = await supabase.from('trips').update({ is_public: false }).eq('id', trip.id)
    setPublishing(false)
    if (error) {
      setShareNote(`Couldn't make it private: ${error.message}`)
      setTimeout(() => setShareNote(null), 8000)
      return
    }
    setIsPublic(false)
    // Said out loud, because a link already sent to somebody stops working
    // at this moment and they will not be told.
    setShareNote('Private again. Any link you already sent has stopped working.')
    setTimeout(() => setShareNote(null), 8000)
  }

  async function doShare() {
    // Not window.location.origin: on iOS that is capacitor://localhost,
    // and the share sheet cheerfully sent people a link no browser can
    // open.
    const url = `${siteOrigin()}/?share=${trip.slug}&show=journal,flights,map`
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.title, url })
        return
      } catch (err) {
        if (err?.name === 'AbortError') return // they changed their mind
        // Anything else: the sheet could not open. Fall through.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setShareNote(url)
      setTimeout(() => setShareNote(null), 12000)
    }
  }

  // Rendered into <body> rather than in place. The story card this opens
  // from carries a backdrop-filter, which makes it the containing block for
  // any position:fixed descendant — so "full screen" quietly became "the
  // bottom third of the card".
  return createPortal(
    // style carries where the tapped card was, as a vector from the middle of
    // the screen, so the recap grows out of it instead of appearing on top of
    // it. Two custom properties and a scale is the whole trick — one element,
    // transform and opacity only, nothing the compositor can't own.
    <div
      ref={recapRef}
      className={`recap${layer ? ' layered' : ''}${reveal ? ' in' : ' waiting'}${recapDrag ? ' dragging' : ''}`}
      style={recapDrag ? { ...originVars, transform: `translateY(${recapDrag}px)` } : originVars}
    >
      {/* Says the page can be pulled down, which the close button alone never
          did. Over a full-bleed photo, so it carries its own contrast. */}
      <div className="recap-grab" aria-hidden="true" />

      {/* Top-left chevron, like the planner's and like the sheet's own bar
          one level down. It was an ✕ on the right, which put the two ways of
          leaving a trip in opposite corners wearing different glyphs — and
          left the app answering "how do I get out of here" differently
          depending on whether the trip had happened yet. The planner's
          right-hand corner belongs to the ✨ button, so left is the corner
          both can keep. */}
      <button className="recap-close" onClick={onClose} aria-label="Back">
        <Icon name="chevron" size={16} className="recap-close-i" />
      </button>

      <div className="recap-scroll" ref={scrollRef}>
        <header
          className={`recap-hero${hero ? '' : ' recap-hero--drawn'}`}
          style={{ '--trip-accent': tripColor(trip.slug) }}
        >
          {hero && (
            <img
              className="recap-hero-img"
              src={coverUrl(hero, { width: 1400, height: 1800, quality: 82 })}
              alt=""
              onError={() => setCoverBroke(true)}
            />
          )}
          <div className="recap-hero-scrim" />
          <div className="recap-hero-text">
            <div className="recap-eyebrow">
              <CountryFlags countries={trip.countries} size={16} /> in one page
            </div>
            <h1 className="recap-title">{trip.title}</h1>
            <div className="recap-dates">{fmtRange(trip)}</div>
          </div>
        </header>

        {hint && stats.figures.some((f) => f.to) && (
          <div className="recap-hint">The underlined numbers open</div>
        )}

        {stats.figures.length > 0 && (
          /* Remounted on reveal so the staggered entrance plays for someone
             watching, rather than having quietly run while this was hidden
             behind the globe. */
          <div className="recap-figures" key={reveal ? 'in' : 'wait'}>
            {stats.figures.map((f, i) => {
              // A number counted from rows you can go and look at should
              // take you to them — "12 photos" opens the gallery, "9 days
              // written up" opens the journal. Which is why the recap needs
              // no row of signpost tiles under it.
              const go = !!f.to
              const Tag = go ? 'button' : 'div'
              return (
                /* Staggered so the numbers land one after another rather
                   than all at once — the point is that they're read. */
                <Tag
                  className={`recap-figure${go ? ' linked' : ''}`}
                  key={f.key}
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                  onClick={go ? () => setLayer(f.to) : undefined}
                >
                  <span className="recap-figure-value">{f.value}</span>
                  <span className="recap-figure-label">{f.label}</span>
                </Tag>
              )
            })}
          </div>
        )}

        {summary.text && (
          <p className="recap-prose">
            {summary.text}{' '}
            {/* A link, not a button. There are already two buttons on this
                page and both of them do something to the trip; this only
                goes somewhere, and the paragraph it follows is the reason
                somebody would want to. */}
            <button className="recap-more" onClick={() => setLayer('journal')}>
              read the whole thing →
            </button>
          </p>
        )}

        {/* Small, to the right, and absent when there is nothing to say.
            A trip whose days have never been opened in the journal has no
            cached weather and simply does not mention it. */}
        {(warmth || skies) && (
          <div className="recap-weather">
            {skies} {warmth ? `${warmth.text} average` : null}
          </div>
        )}

        {stats.cities.length > 0 && (
          <div className="recap-cities">
            {stats.cities.map((c) => (
              <span className="recap-city" key={c}>
                {c}
              </span>
            ))}
          </div>
        )}

        {shown.length > 0 && (
          /* Every photograph on this page is now a way in to the rest of
             them. It looked tappable and wasn't, which on a page whose
             figures are all buttons reads as broken rather than decorative
             — and "open the photos" was reachable only by the count above,
             which is absent on a trip with few enough to fit here. Opens
             the sheet on the one that was tapped, not at the top: being
             returned to the grid to find again what you just pointed at is
             the small insult that makes people stop tapping. */
          <div className="recap-photos">
            {shown.map((p) => (
              <button
                key={p.url}
                type="button"
                className="recap-photo"
                onClick={() => {
                  setLayerPhoto(p.id)
                  setLayer('photos')
                }}
                aria-label={p.caption || 'Open this photo'}
              >
                <img
                  src={p.thumb_url || thumb(p.url, { width: 400, height: 400 })}
                  alt={p.caption || ''}
                  loading="lazy"
                  /* A dead URL should leave a gap, not a broken-image icon
                     sitting in the middle of a page built to be shown off. */
                  onError={(e) => {
                    e.currentTarget.closest('.recap-photo').style.display = 'none'
                  }}
                />
              </button>
            ))}
          </div>
        )}

        {/* The way in to photographs, when there are none.
            //
            The figures are this page's navigation, and recapStats only
            renders a figure with something behind it — rightly, since a
            proud zero is worse than silence. But Photos is reachable from
            *nowhere else* on a finished trip: the tab left the bottom bar
            because it is a per-trip view, and you enter a per-trip view
            through here. So a trip with no photographs offered no route to
            add the first one, and the only way to put photos on it was to
            go round through "Add a trip". Being able to add the second
            photo but not the first is the wrong way round. */}
        {!stats.figures.some((f) => f.key === 'photos') && (
          <button className="recap-add-photos" onClick={() => setLayer('photos')}>
            Add photos to this trip
          </button>
        )}

        {/* Bookings belong to the trip, not to its photographs. This sat in
            the middle of the photo stream — a full-width card about email
            between two pictures — because the planner is the only other
            place it lived and a finished trip never opens the planner. Here
            it is one of the things you can do to a trip, next to the others. */}
        {trip?.start_date && (
          <button className="recap-share ghost" onClick={() => setFindingBookings(true)}>
            Find this trip&apos;s bookings in your email
          </button>
        )}

        <button className="recap-share" onClick={share}>
          {copied ? 'Link copied' : 'Share this trip'}
        </button>

        {/* The way back. Making a trip public from here would otherwise be a
            door that only opens one way, and somebody who publishes a trip
            by mistake should not have to ask how to undo it.

            Not on the examples. Those are public because they are the app's
            shop window, and their switch lives in Account — two controls for
            one flag, in different places, is how you end up turning off the
            thing every new arrival sees and not knowing where you did it. */}
        {isPublic && trip.owned !== false && !trip.is_demo && (
          <div className="recap-visibility">
            <span>Anyone with the link can open this.</span>
            <button onClick={makePrivate} disabled={publishing}>
              {publishing ? 'one sec…' : 'Make private'}
            </button>
          </div>
        )}

        {shareNote && <div className="recap-share-note">{shareNote}</div>}
      </div>

      {/* Asked, not assumed. This is the only action on the screen that
          changes who can see somebody's holiday, so it says what it does in
          the plainest words available and offers a way out that is as easy
          to hit as the way through. */}
      {findingBookings && (
        <GmailImport trip={trip} onClose={() => setFindingBookings(false)} onImported={() => {}} />
      )}

      {askPublic && (
        <div className="recap-ask" role="dialog" aria-modal="true" aria-label="Make this trip public">
          <div className="recap-ask-card">
            <h2>Share {trip.title}?</h2>
            <p>
              Only you can see this trip at the moment, so a link would open to nothing. Making it
              public means anybody holding the link can read the journal, see the map and the
              photographs — no account needed.
            </p>
            <p className="recap-ask-quiet">You can make it private again straight afterwards.</p>
            <div className="recap-ask-buttons">
              <button className="recap-ask-no" onClick={() => setAskPublic(false)} disabled={publishing}>
                Not now
              </button>
              <button className="recap-ask-yes" onClick={makePublicAndShare} disabled={publishing}>
                {publishing ? 'one sec…' : 'Make public & share'}
              </button>
            </div>
          </div>
        </div>
      )}

      {layer && (
        <section
          className={`recap-layer ${layer}${settled ? ' settled' : ''}${drag ? ' dragging' : ''}`}
          key={layer}
          ref={sheetRef}
          style={drag ? { transform: `translateY(${drag}px)` } : undefined}
          onAnimationEnd={(e) => e.target === e.currentTarget && setSettled(true)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {/* The frosted pane behind the sheet's content — see
              .recap-layer-glass for why the blur can't sit on the sheet. */}
          <div className="recap-layer-glass" />
          <GestureReadout />
          <header className="recap-layer-bar">
            <button
              className="recap-layer-back"
              onClick={() => {
                setLayer(null)
                setLayerPhoto(null)
              }}
            >
              <Icon name="chevron" size={16} className="recap-layer-back-i" />
              <span>{trip.title}</span>
            </button>
            {/* One way out, not two. The ✕ and the back link did the same
                thing, and of the pair only the link says where you land. */}
            <span className="recap-layer-title">{LAYERS[layer].title}</span>
          </header>
          <div className="recap-layer-body" ref={bodyRef}>
            <SheetContext.Provider value={true}>
              <Suspense fallback={<div className="tab-loading">loading…</div>}>
                {(() => {
                  const { View } = LAYERS[layer]
                  // The tab views read the selection from context and ignore
                  // this; RunsPanel is built for the sheet and takes the trip.
                  // Photos also takes the one to open on, when a photograph
                  // rather than a figure is what opened the sheet.
                  return <View trip={trip} openPhotoId={layer === 'photos' ? layerPhoto : null} />
                })()}
              </Suspense>
            </SheetContext.Provider>
          </div>
        </section>
      )}
    </div>,
    document.body
  )
}
