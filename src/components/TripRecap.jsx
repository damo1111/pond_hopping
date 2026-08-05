import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase.js'
import { coverUrl, thumb } from '../lib/imgTransform.js'
import { recapStats } from '../lib/tripRecap.js'
import CountryFlags from './CountryFlags.jsx'
import Icon from './Icon.jsx'

// Lazy so the recap doesn't drag four tab views — and Leaflet — into the
// Home chunk for the many opens where nobody taps a figure.
const JournalTab = lazy(() => import('../tabs/JournalTab.jsx'))
const PhotosTab = lazy(() => import('../tabs/PhotosTab.jsx'))
const MapTab = lazy(() => import('../tabs/MapTab.jsx'))
const FlightsTab = lazy(() => import('../tabs/FlightsTab.jsx'))

const LAYERS = {
  journal: { title: 'Journal', View: JournalTab },
  photos: { title: 'Photos', View: PhotosTab },
  map: { title: 'Map', View: MapTab },
  flights: { title: 'Flights', View: FlightsTab },
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

export default function TripRecap({ trip, cover, onClose }) {
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)
  // Which sub-view is open over the recap. The recap itself stays mounted
  // underneath, so closing this comes back here rather than dumping you on
  // a tab with no way back — which is what tapping a figure used to do.
  const [layer, setLayer] = useState(null)
  const [hint, setHint] = useState(false)

  useEffect(() => {
    const seen = Number(localStorage.getItem(HINT_KEY) || 0)
    if (seen >= HINT_TIMES) return
    localStorage.setItem(HINT_KEY, String(seen + 1))
    const show = setTimeout(() => setHint(true), 1100)
    const hide = setTimeout(() => setHint(false), 6600)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [])

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
    ]).then(([f, e, r, p, s]) => {
      if (!alive) return
      setData({
        flights: f.data ?? [],
        entries: e.data ?? [],
        runs: r.data ?? [],
        photos: p.data ?? [],
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
    <div className="recap">
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
          <div className="recap-hint">Tap any underlined number to open it</div>
        )}

        {stats.figures.length > 0 && (
          <div className="recap-figures">
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
        <section className="recap-layer" key={layer}>
          <header className="recap-layer-bar">
            <button className="recap-layer-back" onClick={() => setLayer(null)}>
              <Icon name="chevron" size={16} className="recap-layer-back-i" />
              <span>{trip.title}</span>
            </button>
            <span className="recap-layer-title">{LAYERS[layer].title}</span>
            <button className="recap-layer-close" onClick={() => setLayer(null)} aria-label="Back to the recap">
              <Icon name="close" size={15} />
            </button>
          </header>
          <div className="recap-layer-body">
            <Suspense fallback={<div className="tab-loading">loading…</div>}>
              {(() => {
                const { View } = LAYERS[layer]
                return <View />
              })()}
            </Suspense>
          </div>
        </section>
      )}
    </div>,
    document.body
  )
}
