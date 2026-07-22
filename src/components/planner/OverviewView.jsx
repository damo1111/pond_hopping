import { useEffect, useState } from 'react'
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

function nights(a, b) {
  if (!a || !b) return null
  const d = (new Date(b) - new Date(a)) / 86400000
  return d > 0 ? Math.round(d) : null
}

// Free, keyless Wikipedia lookup — same trick already used for wishlist
// and event photos. Only called when a trip genuinely has no cover yet,
// and the result is cached in photo_cache so it's a one-time fetch per
// trip, not a fetch on every Overview visit.
async function fetchDestinationPhoto(trip) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(destinationQuery(trip))}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.type === 'disambiguation') return null
    return data.thumbnail?.source || data.originalimage?.source || null
  } catch {
    return null
  }
}

export default function OverviewView({ trip, events, onEditEvent, onEventsChange, onAskAI, onAdded }) {
  const [cover, setCover] = useState(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
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
        // No cover on file for this trip yet — auto-fill one from the
        // destination, going forward, so a fresh draft never shows blank.
        const photo = await fetchDestinationPhoto(trip)
        if (!photo) return
        if (alive) setCover(photo)
        await supabase.from('photo_cache').upsert({ trip_id: trip.id, urls: [photo], status: 'ok', updated_at: new Date().toISOString() })
      })
    return () => {
      alive = false
    }
  }, [trip.id])

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
      <div className="ov-hero">
        {cover && <img className="ov-hero-img" src={coverUrl(cover, { width: 900, height: 500 })} alt="" />}
        <div className="ov-hero-shade" />
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

      {trip.start_date && trip.end_date && (
        <button className="ov-import" onClick={() => setImporting(true)}>
          <span className="ov-import-i">📬</span>
          <span className="ov-import-body">
            <span className="ov-import-title">Add a booking</span>
            <span className="ov-import-sub">Paste a confirmation — I'll pull out the flights, stays &amp; bookings</span>
          </span>
          <span className="ov-import-arrow">→</span>
        </button>
      )}

      {importing && <GmailImport trip={trip} onClose={() => setImporting(false)} onImported={onAdded} />}

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
