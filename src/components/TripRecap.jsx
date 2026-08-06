import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase.js'
import { coverUrl, thumb } from '../lib/imgTransform.js'
import { recapStats } from '../lib/tripRecap.js'
import { SheetContext } from '../lib/sheetContext.js'
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

export default function TripRecap({ trip, cover, reveal = true, onClose }) {
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)
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
  // How far the sheet has been pulled down, in px. The handle was drawn as an
  // affordance the sheet didn't honour: it looks like something you can pull,
  // so on the web a downward drag went to the browser's pull-to-refresh
  // instead. Now the sheet takes the gesture.
  const [drag, setDrag] = useState(0)
  const dragRef = useRef(null)
  const bodyRef = useRef(null)
  const sheetRef = useRef(null)

  useEffect(() => {
    setSettled(false)
    setDrag(0)
  }, [layer])

  // Far enough down to be deliberate rather than a stray thumb.
  const CLOSE_AT = 96

  // ── One gesture, fed by whichever events the engine actually sends ────────
  //
  // A finger on Android produces pointer events *and* touch events, and each
  // family can fail in a way the other doesn't. Pointer events get cancelled
  // the moment the browser decides a vertical drag over a scrollable element
  // is a scroll — which is why pulling down from inside the flights list did
  // nothing. Touch events survive that, but only a non-passive touchmove can
  // call preventDefault, and an engine that has already begun scrolling will
  // ignore it.
  //
  // So neither family is trusted on its own. Both drive one shared gesture
  // object, and every operation on it is idempotent: two sources reporting
  // the same finger at the same place set the same drag, and only the first
  // one to finish decides. Making one family exclusive is what broke the
  // handle — it had been working on pointer events all along.
  const gesture = dragRef

  function begin(y, t, target, sawTouch) {
    // From the bar always; from the body only when it's already at the top,
    // so pulling the sheet never competes with reading what's in it.
    const fromBody = bodyRef.current?.contains(target)
    if (fromBody && (bodyRef.current.scrollTop || 0) > 0) return
    const g = gesture.current
    // Already tracking this same finger from the other event family.
    if (g && Math.abs(g.y - y) < 2) { g.sawTouch = g.sawTouch || sawTouch; return }
    gesture.current = { y, t, dy: 0, at: t, claimed: false, sawTouch }
  }

  // Returns true when the gesture is ours, which is the caller's cue to take
  // the event away from the browser.
  function extend(y, t) {
    const g = gesture.current
    if (!g) return false
    const dy = y - g.y
    // Only a downward pull is ours. An upward one is the list scrolling, and
    // letting go of it here is what keeps reading unaffected.
    if (dy <= 0) {
      if (g.claimed) setDrag(0)
      gesture.current = null
      return false
    }
    if (!g.claimed && dy < 6) return false
    g.claimed = true
    g.dy = dy
    g.at = t
    // Resistance past the threshold, so it feels attached to something.
    setDrag(dy < CLOSE_AT ? dy : CLOSE_AT + (dy - CLOSE_AT) * 0.4)
    return true
  }

  // Read off the last position we actually rendered rather than off the
  // finishing event: touchcancel carries no touch at all, and pointerup after
  // a capture loss can carry a stale one.
  function finish() {
    const g = gesture.current
    gesture.current = null
    if (!g?.claimed) return
    // A short flick closes as surely as a long pull.
    const velocity = g.dy / Math.max(1, g.at - g.t)
    if (g.dy > CLOSE_AT || velocity > 0.6) setLayer(null)
    else setDrag(0)
  }

  useEffect(() => {
    const el = sheetRef.current
    if (!el) return

    const onStart = (e) => {
      if (e.touches.length !== 1) return
      begin(e.touches[0].clientY, e.timeStamp, e.target, true)
    }
    const onMove = (e) => {
      if (extend(e.touches[0].clientY, e.timeStamp) && e.cancelable) e.preventDefault()
    }
    const onEnd = () => finish()
    // A cancelled gesture is not a decision — spring back rather than close.
    const onCancel = () => {
      gesture.current = null
      setDrag(0)
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onCancel)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer])

  function onPointerDown(e) {
    begin(e.clientY, e.timeStamp, e.target, false)
  }

  function onPointerMove(e) {
    if (extend(e.clientY, e.timeStamp)) e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onPointerUp() {
    finish()
  }

  // The browser cancels the pointer stream as soon as it claims the drag as a
  // scroll. If touch events are also feeding this gesture they are still
  // live and still preventing that scroll, so this says nothing — but with a
  // mouse, or an engine sending pointer events only, it means the drag is over.
  function onPointerCancel() {
    if (gesture.current?.sawTouch) return
    gesture.current = null
    setDrag(0)
  }

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

  useEffect(() => {
    if (!trip?.id) return
    let alive = true
    Promise.all([
      supabase
        .from('flights')
        .select('distance_km,dep_airport,arr_airport,dep_city,arr_city,dep_time')
        .eq('trip_id', trip.id)
        .eq('status', 'flown'),
      supabase.from('journal_entries').select('city,entry_date,title').eq('trip_id', trip.id),
      supabase.from('runs').select('distance_km').eq('trip_id', trip.id),
      // thumb_url is a stored, already-rendered file; thumb() builds a URL
      // against Supabase's on-the-fly transform endpoint. Asking that
      // endpoint for twelve renders at once is what broke the grid, which
      // is why PhotosTab has always preferred the stored one. 500 of the
      // 504 rows have one; the transform is the fallback, not the default.
      //
      // Highlights first, so the recap leads with the good ones rather than
      // the first twelve that happened to be inserted.
      supabase
        .from('photos')
        .select('url,thumb_url,caption,is_highlight,taken_on')
        .eq('trip_id', trip.id)
        .order('is_highlight', { ascending: false })
        .order('taken_on', { ascending: true })
        .limit(12),
      supabase.from('trip_summaries').select('summary').eq('trip_id', trip.id).maybeSingle(),
      // The strip is twelve; the figure has to be all of them. Counting the
      // twelve gave "12 photos" for a trip with 181. A head request costs one
      // round trip and no rows.
      supabase.from('photos').select('id', { count: 'exact', head: true }).eq('trip_id', trip.id),
    ]).then(([f, e, r, p, s, n]) => {
      if (!alive) return
      setData({
        flights: f.data ?? [],
        entries: e.data ?? [],
        runs: r.data ?? [],
        photos: p.data ?? [],
        photoCount: n.count ?? null,
        summary: s.data?.summary ?? null,
      })
    })
    return () => {
      alive = false
    }
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

  function share() {
    const url = `${window.location.origin}/?share=${trip.slug}&show=journal,flights,map`
    if (navigator.share) {
      navigator.share({ title: trip.title, url }).catch(() => {})
      return
    }
    navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Rendered into <body> rather than in place. The story card this opens
  // from carries a backdrop-filter, which makes it the containing block for
  // any position:fixed descendant — so "full screen" quietly became "the
  // bottom third of the card".
  return createPortal(
    <div className={`recap${layer ? ' layered' : ''}${reveal ? ' in' : ' waiting'}`}>
      <button className="recap-close" onClick={onClose} aria-label="Close">
        <Icon name="close" size={16} />
      </button>

      <div className="recap-scroll">
        <header className="recap-hero">
          {cover && <img className="recap-hero-img" src={coverUrl(cover, { width: 900, height: 1200 })} alt="" />}
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
