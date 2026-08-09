import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase.js'
import { coverUrl, thumb } from '../lib/imgTransform.js'
import { recapStats } from '../lib/tripRecap.js'
import { tripColor } from '../lib/tripColors.js'
import { SheetContext } from '../lib/sheetContext.js'
import { beginDrag, extendDrag, finishDrag } from '../lib/sheetDrag.js'
import { gather } from '../lib/gather.js'
import { record as debug, clear as clearDebug, read as readDebug, isOn as debugOn, subscribe as onDebug } from '../lib/gestureDebug.js'
import CountryFlags from './CountryFlags.jsx'
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

function fmtRange(t) {
  if (!t?.start_date) return ''
  const opt = { day: 'numeric', month: 'long', year: 'numeric' }
  const a = new Date(t.start_date).toLocaleDateString('en-GB', opt)
  const b = t.end_date ? new Date(t.end_date).toLocaleDateString('en-GB', opt) : null
  return b && b !== a ? `${a} – ${b}` : a
}

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
  // The frosted pane is the expensive part: blurring a backdrop that is
  // itself mid-animation costs a full re-blur every frame, on a phone, at
  // exactly the moment the sheet needs those frames. So the sheet rises
  // over a flat surface and only goes frosted once it has arrived.
  const [settled, setSettled] = useState(false)
  const [hint, setHint] = useState(false)
  // A cover URL that 404s. Google Photos share links do, eventually.
  const [coverBroke, setCoverBroke] = useState(false)
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
            .select('url,thumb_url,caption,is_highlight,taken_on')
            .eq('trip_id', trip.id)
            .order('is_highlight', { ascending: false })
            .order('taken_on', { ascending: true })
            .limit(12),
          take: (p) => ({ photos: p.data ?? [] }),
        },
        {
          query: supabase.from('trip_summaries').select('summary').eq('trip_id', trip.id).maybeSingle(),
          take: (s) => ({ summary: s.data?.summary ?? null }),
        },
        {
          // The strip is twelve; the figure has to be all of them. Counting
          // the twelve gave "12 photos" for a trip with 181. A head request
          // costs one round trip and no rows.
          query: supabase.from('photos').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id),
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

  if (!trip) return null

  const stats = recapStats({ trip, ...(data ?? {}) })

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
  async function share() {
    if (trip.is_public === false) {
      setShareNote('This trip is private — nobody else could open the link. Make it public first.')
      setTimeout(() => setShareNote(null), 5000)
      return
    }
    const url = `${window.location.origin}/?share=${trip.slug}&show=journal,flights,map`
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

      <button className="recap-close" onClick={onClose} aria-label="Close">
        <Icon name="close" size={16} />
      </button>

      <div className="recap-scroll" ref={scrollRef}>
        <header
          className={`recap-hero${hero ? '' : ' recap-hero--drawn'}`}
          style={{ '--trip-accent': tripColor(trip.slug) }}
        >
          {hero && (
            <img
              className="recap-hero-img"
              src={coverUrl(hero, { width: 900, height: 1200 })}
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

        {data?.summary && <p className="recap-prose">{data.summary}</p>}

        {stats.cities.length > 0 && (
          <div className="recap-cities">
            {stats.cities.map((c) => (
              <span className="recap-city" key={c}>
                {c}
              </span>
            ))}
          </div>
        )}

        {data?.photos?.length > 0 && (
          <div className="recap-photos">
            {data.photos.map((p) => (
              <img
                key={p.url}
                src={p.thumb_url || thumb(p.url, { width: 400, height: 400 })}
                alt={p.caption || ''}
                loading="lazy"
                /* A dead URL should leave a gap, not a broken-image icon
                   sitting in the middle of a page built to be shown off. */
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ))}
          </div>
        )}

        <button className="recap-share" onClick={share}>
          {copied ? 'Link copied' : 'Share this trip'}
        </button>
        {shareNote && <div className="recap-share-note">{shareNote}</div>}
      </div>

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
            <button className="recap-layer-back" onClick={() => setLayer(null)}>
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
                  return <View trip={trip} />
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
