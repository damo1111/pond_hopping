import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet'
import { supabase } from '../../lib/supabase.js'
import { greatCircle, boundsExcludingHome } from '../../lib/geo.js'
import { AIRPORT_COORDS } from '../../lib/airportCoords.js'
import { CITY_COORDS } from '../../lib/cityCoords.js'
import { KIND_META, destinationQuery, tripDays, sortEvents, eventsForDay, fmtDayLong } from '../../lib/planItems.js'
import { coverUrl } from '../../lib/imgTransform.js'
import { TimelineItem, SpanRow } from './ItineraryView.jsx'
import Concierge from './Concierge.jsx'
import GmailImport from './GmailImport.jsx'
import Travellers from './Travellers.jsx'
import Icon from '../Icon.jsx'
import { uploadCover } from '../../lib/photoIngest.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { isDemo } from '../../lib/demoTour.js'
import { oops } from '../../lib/analytics.js'

function nights(a, b) {
  if (!a || !b) return null
  const d = (new Date(b) - new Date(a)) / 86400000
  return d > 0 ? Math.round(d) : null
}

// Free, keyless Wikipedia lookup — same trick already used for wishlist
// and event photos. Only called when a trip genuinely has no cover yet,
// and the result is cached in photo_cache so it's a one-time fetch per
// trip, not a fetch on every Overview visit.
async function summaryPhoto(term) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.type === 'disambiguation') return null
    return data.originalimage?.source || data.thumbnail?.source || null
  } catch {
    return null
  }
}

// The country was the only thing asked for before, which gave a Lisbon &
// Porto trip a generic photograph of Portugal. Where you're actually going
// is written all over the itinerary — so try the city you'll spend the most
// nights in first, and only fall back to the country if that draws a blank.
async function fetchDestinationPhoto(trip, events) {
  const tally = {}
  for (const e of events || []) if (e.city) tally[e.city] = (tally[e.city] || 0) + 1
  const cities = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)

  for (const term of [...cities, destinationQuery(trip)]) {
    const photo = await summaryPhoto(term)
    if (photo) return photo
  }
  return null
}

export default function OverviewView({ trip, events, onEditEvent, onEventsChange, onAskAI, onAdded, onCover }) {
  const { user } = useAuth()
  // Signed in, and not somebody else's example. The same expression
  // TripStory guards its writing with, for the same reason: the demo is a
  // finished trip parked on a stranger's globe, and nothing on it is theirs
  // to change.
  const mayAdd = !!user && !isDemo(trip)
  const [cover, setCover] = useState(null)
  const [importing, setImporting] = useState(false)
  // Uploading, or the reason it didn't. The URL box this replaced needed a
  // draft string; a file picker needs neither — the file is chosen in one
  // gesture and there is nothing to hold on to between.
  const [adding, setAdding] = useState(false)
  const [coverTrouble, setCoverTrouble] = useState(null)
  const coverInput = useRef(null)

  async function pickCover(file) {
    if (!file) return
    setCoverTrouble(null)
    setAdding(true)
    try {
      // Shrunk on the phone first, like every other photograph the app
      // takes — a 12MP cover is four seconds of upload for a picture that
      // is about to be drawn 390px wide behind a gradient.
      await saveCover(await uploadCover(file, trip.id))
    } catch (e) {
      setCoverTrouble(e?.message ? 'That picture would not go up. Try another.' : 'That did not work.')
      oops('cover', e, 'OverviewView')
    } finally {
      setAdding(false)
    }
  }

  async function saveCover(url) {
    const next = url.trim() || null
    setCover(next)
    await supabase.from('photo_cache').upsert({
      trip_id: trip.id,
      urls: next ? [next] : [],
      status: next ? 'ok' : 'empty',
      updated_at: new Date().toISOString(),
    })
  }

  // Waits for the itinerary before guessing, since the itinerary is what
  // says where the trip actually goes — and only guesses once per trip, so
  // adding an event doesn't re-run it.
  const guessed = useRef(null)
  useEffect(() => {
    if (guessed.current === trip.id || !events.length) return
    guessed.current = trip.id
    let alive = true
    supabase
      .from('photo_cache')
      .select('urls')
      .eq('trip_id', trip.id)
      .maybeSingle()
      .then(async ({ data }) => {
        const existing = data?.urls?.[0]
        if (existing) {
          if (alive) setCover(existing)
          return
        }
        // Nothing on file yet — fill one in so a fresh draft never shows
        // blank, and remember it so this is a one-time lookup per trip.
        const photo = await fetchDestinationPhoto(trip, events)
        if (!photo) return
        if (alive) setCover(photo)
        await supabase.from('photo_cache').upsert({ trip_id: trip.id, urls: [photo], status: 'ok', updated_at: new Date().toISOString() })
      })
    return () => {
      alive = false
    }
  }, [trip.id, events.length])

  useEffect(() => {
    onCover?.(cover)
  }, [cover, onCover])

  const flights = events.filter((e) => e.kind === 'flight')
  const counts = {}
  for (const e of events) counts[e.kind] = (counts[e.kind] || 0) + 1

  const days = tripDays(trip.start_date, trip.end_date)
  const byDay = {}
  for (const ev of events) {
    const k = ev.event_date || 'unscheduled'
    ;(byDay[k] = byDay[k] || []).push(ev)
  }
  const unscheduled = byDay.unscheduled ? sortEvents(byDay.unscheduled) : []

  async function toggleDone(ev) {
    const { error } = await supabase.from('planned_events').update({ done: !ev.done }).eq('id', ev.id)
    if (!error) onEventsChange?.(events.map((e) => (e.id === ev.id ? { ...e, done: !e.done } : e)))
  }

  // Flight route segments we can actually place on the map.
  const segments = flights
    .map((f) => {
      const from = AIRPORT_COORDS[f.detail?.dep_airport]
      const to = AIRPORT_COORDS[f.detail?.arr_airport]
      return from && to ? { from, to } : null
    })
    .filter(Boolean)

  // Non-flight items (stays, activities...) pinned by city name, so the
  // map shows what's actually happening at the destination, not just the
  // long-haul routes getting there.
  const places = events
    .filter((e) => e.kind !== 'flight' && e.city && CITY_COORDS[e.city])
    .map((e) => ({ ...e, coords: CITY_COORDS[e.city] }))

  const flightPts = segments.flatMap((s) => [s.from, s.to])
  const placePts = places.map((p) => p.coords)
  const allPts = [...flightPts, ...placePts]

  // The real destination is wherever the stays/activities actually are —
  // not every airport a flight happens to touch. A cheap routing via
  // Colombo, or a connection through Helsinki, is "how you get there," not
  // "where you're going," and letting either one drive the fit drags the
  // zoom out to the whole flight path instead of the UK. Same principle as
  // the home-exclusion fix already used on the main Map tab, just applied
  // via the itinerary's own place pins rather than a hardcoded country box
  // — falls back to flights-minus-home if a trip has no stays/activities
  // pinned yet (e.g. only flights booked so far).
  const focusPts = placePts.length ? placePts : boundsExcludingHome(allPts) || allPts
  const center = focusPts.length
    ? [focusPts.reduce((a, p) => a + p[0], 0) / focusPts.length, focusPts.reduce((a, p) => a + p[1], 0) / focusPts.length]
    : [20, 0]
  const latSpread = focusPts.length ? Math.max(...focusPts.map((p) => p[0])) - Math.min(...focusPts.map((p) => p[0])) : 0
  const lonSpread = focusPts.length ? Math.max(...focusPts.map((p) => p[1])) - Math.min(...focusPts.map((p) => p[1])) : 0
  const spread = Math.max(latSpread, lonSpread)
  const zoom = spread < 1 ? 8 : spread < 3 ? 7 : spread < 8 ? 6 : spread < 20 ? 4 : 2

  const n = nights(trip.start_date, trip.end_date)

  return (
    <div className="ov-scroll">
      {/* The picture is painted behind the whole planner (see .tp-cover) so
          it can bleed up past the tabs and day strip and fade out at the very
          top. What stays here is the wording, positioned to land on the part
          of the photo that's still at full strength. */}
      <div className="ov-hero">
        <div className="ov-hero-shade" />
        <button
          className="ov-hero-pick"
          onClick={() => coverInput.current?.click()}
          disabled={adding}
          aria-label="Choose a photo for this trip"
          title="Choose a photo for this trip"
        >
          {/* Was the emoji ⛰ (U+26F0), which has *text* presentation by
              default — no variation selector, so Android draws a bare
              monochrome outline rather than a colour glyph. It came out as
              a grey triangle that says nothing about photographs. A real
              icon renders the same on every platform and is the one every
              other button here already uses. */}
          <Icon name="photo" size={14} />
        </button>
        <div className="ov-hero-text">
          <div className="ov-hero-title">{trip.title}</div>
          <div className="ov-hero-sub">
            {trip.start_date
              ? new Date(trip.start_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              : 'dates tbc'}
            {trip.end_date ? ` – ${new Date(trip.end_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            {n ? ` · ${n} nights` : ''}
          </div>
        </div>
      </div>

      {/* The picker itself. Kept out of the hero button so the button stays a
          button and the input stays invisible on every platform. */}
      <input
        ref={coverInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Cleared before the upload, so choosing the same file twice in a
          // row still fires a change event the second time.
          e.target.value = ''
          pickCover(file)
        }}
      />

      {(adding || coverTrouble) && (
        <div className="ov-cover-note">
          {adding ? 'Adding your picture…' : coverTrouble}
        </div>
      )}

      <div className="ov-stats">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="ov-stat">
            <span className="ov-stat-i" style={{ background: (KIND_META[k] || KIND_META.other).color }}>
              {(KIND_META[k] || KIND_META.other).icon}
            </span>
            <span className="ov-stat-n">{v}</span>
            <span className="ov-stat-l">{v > 1 ? (KIND_META[k] || KIND_META.other).plural : (KIND_META[k] || KIND_META.other).label}</span>
          </div>
        ))}
        {events.length === 0 && <div className="ov-empty">Nothing planned yet — head to Itinerary or ask the AI planner.</div>}
      </div>

      {/* Who came. Not the sharing screen — see Travellers.jsx. */}
      <Travellers trip={trip} />

      {/* Only somebody who can actually add something.
          A signed-out visitor looking at the example trip was offered "Add
          a booking", and the sheet behind it had already lost half its
          contents to the same missing account — so the invitation was to
          paste a confirmation into somebody else's holiday, which
          row-level security would then refuse. The demo is for looking at.
          Same test TripStory uses for the same reason. */}
      {mayAdd && trip.start_date && trip.end_date && (
        <button className="ov-import" onClick={() => setImporting(true)}>
          <span className="ov-import-i">📬</span>
          <span className="ov-import-body">
            <span className="ov-import-title">Add a booking</span>
            <span className="ov-import-sub">Paste a confirmation — I'll pull out the flights, stays &amp; bookings</span>
          </span>
          <span className="ov-import-arrow">→</span>
        </button>
      )}

      {importing && mayAdd && <GmailImport trip={trip} onClose={() => setImporting(false)} onImported={onAdded} />}

      <Concierge trip={trip} events={events} onAskAI={onAskAI} onAdded={onAdded} />

      {allPts.length > 0 && (
        <div className="ov-map">
          <MapContainer center={center} zoom={zoom} zoomControl={false} attributionControl={false} scrollWheelZoom={false} style={{ height: '100%', width: '100%', background: '#EDE9DF' }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            {segments.map((s, i) => (
              <Polyline key={i} positions={greatCircle(s.from, s.to, 64)} pathOptions={{ color: KIND_META.flight.color, weight: 2, dashArray: '5 7' }} />
            ))}
            {flightPts.map((p, i) => (
              <CircleMarker key={`f-${i}`} center={p} radius={4} pathOptions={{ color: KIND_META.flight.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }} />
            ))}
            {places.map((p) => {
              const meta = KIND_META[p.kind] || KIND_META.other
              return (
                <CircleMarker key={p.id} center={p.coords} radius={6} pathOptions={{ color: '#fff', fillColor: meta.color, fillOpacity: 0.95, weight: 1.5 }}>
                  <Popup>
                    <strong>{p.title}</strong>
                    <br />
                    {p.city}
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </div>
      )}

      {days.map((d) => {
        const { starting, spanning } = eventsForDay(events, d.key)
        if (!starting.length && !spanning.length) return null
        return (
          <div key={d.key} className="ov-section">
            <div className="ov-section-title">
              Day {d.dayNum} · {fmtDayLong(d.key)}
            </div>
            <div className="ov-day-items">
              {starting.map((ev) => (
                <TimelineItem
                  key={ev.id}
                  ev={ev}
                  onToggle={() => toggleDone(ev)}
                  onEdit={() => onEditEvent(ev)}
                  onSaveDetail={(id, detail) => onEventsChange?.(events.map((e) => (e.id === id ? { ...e, detail } : e)))}
                />
              ))}
              {spanning.map((ev) => (
                <SpanRow key={ev.id} ev={ev} dayKey={d.key} onEdit={() => onEditEvent(ev)} />
              ))}
            </div>
          </div>
        )
      })}

      {unscheduled.length > 0 && (
        <div className="ov-section">
          <div className="ov-section-title">Unscheduled</div>
          <div className="ov-day-items">
            {unscheduled.map((ev) => (
              <TimelineItem key={ev.id} ev={ev} onToggle={() => toggleDone(ev)} onEdit={() => onEditEvent(ev)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
