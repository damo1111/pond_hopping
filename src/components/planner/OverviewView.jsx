import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet'
import { supabase } from '../../lib/supabase.js'
import { greatCircle } from '../../lib/geo.js'
import { AIRPORT_COORDS } from '../../lib/airportCoords.js'
import { KIND_META, destinationQuery, tripDays, sortEvents, fmtDayLong } from '../../lib/planItems.js'
import { coverUrl } from '../../lib/imgTransform.js'
import { TimelineItem } from './ItineraryView.jsx'

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

export default function OverviewView({ trip, events, onEditEvent, onEventsChange }) {
  const [cover, setCover] = useState(null)

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

  const pts = segments.flatMap((s) => [s.from, s.to])
  const center = pts.length
    ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]
    : [20, 0]

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

      {segments.length > 0 && (
        <div className="ov-map">
          <MapContainer center={center} zoom={2} zoomControl={false} attributionControl={false} scrollWheelZoom={false} style={{ height: '100%', width: '100%', background: '#EDE9DF' }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            {segments.map((s, i) => (
              <Polyline key={i} positions={greatCircle(s.from, s.to, 64)} pathOptions={{ color: KIND_META.flight.color, weight: 2, dashArray: '5 7' }} />
            ))}
            {pts.map((p, i) => (
              <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: KIND_META.flight.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }} />
            ))}
          </MapContainer>
        </div>
      )}

      {days.map((d) => {
        const dayEvents = sortEvents(byDay[d.key] || [])
        if (!dayEvents.length) return null
        return (
          <div key={d.key} className="ov-section">
            <div className="ov-section-title">
              Day {d.dayNum} · {fmtDayLong(d.key)}
            </div>
            <div className="ov-day-items">
              {dayEvents.map((ev) => (
                <TimelineItem
                  key={ev.id}
                  ev={ev}
                  onToggle={() => toggleDone(ev)}
                  onEdit={() => onEditEvent(ev)}
                  onSaveDetail={(id, detail) => onEventsChange?.(events.map((e) => (e.id === id ? { ...e, detail } : e)))}
                />
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
