import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet'
import { supabase } from '../lib/supabase.js'
import { words } from '../lib/sport.js'

const INK = '#1A1611'
const GOLD = '#A8842C'
const GREEN = '#3E7D54'

function fmtDur(min) {
  if (min >= 60) return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
  return `${min}m`
}

/** The calendar day a timestamp fell on where the reader is standing. */
function localDay(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// A stop the phone noticed by itself, in the shape the imported ones already
// use. The times are rendered in the reader's own timezone, which is the only
// one available — a CLVisit records an instant, not a wall clock.
function asVisit(row) {
  const t = row.arrived_at ? new Date(row.arrived_at) : null
  const e = row.departed_at ? new Date(row.departed_at) : null
  const clock = (d) =>
    d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'
  return {
    lat: row.lat,
    lon: row.lng,
    t: clock(t),
    e: clock(e),
    min: t && e ? Math.max(0, Math.round((e - t) / 60000)) : 0,
    recorded: true,
  }
}

// The day's real movements: ink line = the day's path, gold dots = timed
// stops, green = runs.
//
// Stops come from two places and are drawn the same, because to the person
// reading it they are the same thing. `day_tracks` holds what was imported
// from a Google Timeline export; `location_visits` holds what the phone
// noticed on its own. The second one had no reader at all until now, which
// meant switching the recorder on produced nothing visible, forever.
export default function DayMap({ tripId, date }) {
  const [track, setTrack] = useState(undefined) // undefined loading, null none
  const [runs, setRuns] = useState([])
  const [recorded, setRecorded] = useState([])
  // Where the photographs were taken. On a trip reconstructed years later
  // this is the only record of the day's route that exists — there is no
  // Google Timeline export and the phone was not recording visits. A day
  // with a hundred and seventeen geotagged photographs across Rome was
  // drawing a fifty-metre fragment of somebody else's data.
  const [shots, setShots] = useState([])
  // The places the reconstruction actually named, so the map says where you
  // were rather than only that you were somewhere. Dots are the basics; a
  // name against a dot is the point.
  const [named, setNamed] = useState([])

  useEffect(() => {
    let alive = true
    // A day either side, then filtered locally below. A bare timestamp in a
    // PostgREST filter is read as UTC, and a stop at eight in the morning in
    // Tokyo is eleven at night in UTC the day before — which is every
    // morning of a trip to Asia landing on the wrong day's map.
    const dayStart = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString()
    const dayEnd = new Date(Date.parse(`${date}T00:00:00Z`) + 2 * 86400000).toISOString()
    Promise.all([
      supabase.from('day_tracks').select('path,visits').eq('trip_id', tripId).eq('track_date', date).limit(1),
      supabase.from('runs').select('label,distance_km,pace,color,coords,sport').eq('trip_id', tripId).eq('run_date', date),
      // Own visits only, by RLS — a shared trip never shows the owner's.
      supabase
        .from('location_visits')
        .select('lat,lng,arrived_at,departed_at')
        .gte('arrived_at', dayStart)
        .lte('arrived_at', dayEnd)
        .order('arrived_at'),
      supabase
        .from('photos')
        .select('lat,lon,taken_at')
        .eq('trip_id', tripId)
        .eq('taken_on', date)
        .not('lat', 'is', null)
        .order('taken_at'),
      supabase.from('trip_stories').select('reconstruction').eq('trip_id', tripId).maybeSingle(),
    ]).then(([t, r, v, p, story]) => {
      if (!alive) return
      setTrack(t.data?.[0] ?? null)
      setRuns(r.data ?? [])
      // The reader's own timezone is the one the times are shown in, and
      // while you are on the trip it is the trip's — so it is the one the
      // day is decided in too.
      setRecorded((v.data ?? []).filter((row) => localDay(row.arrived_at) === date).map(asVisit))
      setShots((p.data ?? []).map((row) => [row.lat, row.lon]))
      const day = (story.data?.reconstruction?.days ?? []).find((d) => d.date === date)
      setNamed(
        (day?.episodes ?? []).filter((e) => e?.where && e.lat != null && e.lon != null)
      )
    })
    return () => {
      alive = false
    }
  }, [tripId, date])

  if (track === undefined) return <div className="daymap-loading">loading the day…</div>
  if (!track && !runs.length && !recorded.length && !shots.length && !named.length) return null

  const path = track?.path ?? []
  const visits = [...(track?.visits ?? []), ...recorded]
  const bounds = [
    ...path,
    ...visits.map((v) => [v.lat, v.lon]),
    ...runs.flatMap((r) => [r.coords[0], r.coords[r.coords.length - 1]]),
    ...shots,
    ...named.map((e) => [e.lat, e.lon]),
  ]
  if (!bounds.length) return null

  return (
    <div className="daymap">
      {/* Inert on purpose. This is a picture of the day, sitting inside a
          story you scroll through — a finger that lands on it mid-scroll
          should carry on scrolling, not drag Wellington off the screen. The
          Map sheet is where a map you can actually drive lives. */}
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [24, 24] }}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        boxZoom={false}
        keyboard={false}
        style={{ height: 230, width: '100%', background: '#EDE9DF' }}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" />

        {path.length > 1 && (
          <Polyline positions={path} pathOptions={{ color: INK, weight: 2, opacity: 0.55 }} />
        )}

        {/* Where the photographs were taken, in order. Dashed, because it is
            not a recorded track — it is the line between the places somebody
            stopped to take a picture, and the walking between them is
            inferred rather than known. On a trip pieced together years
            afterwards it is the only route there is. */}
        {shots.length > 1 && (
          <Polyline
            positions={shots}
            pathOptions={{ color: GOLD, weight: 2, opacity: 0.75, dashArray: '4 5' }}
          />
        )}
        {shots.map((p, i) => (
          <CircleMarker
            key={`s${i}`}
            center={p}
            radius={2.5}
            pathOptions={{ color: GOLD, fillColor: GOLD, fillOpacity: 0.85, weight: 0 }}
          />
        ))}

        {/* The places the day was actually made of, named. */}
        {named.map((e, i) => (
          <CircleMarker
            key={`n${i}`}
            center={[e.lat, e.lon]}
            radius={6}
            pathOptions={{ color: INK, fillColor: GOLD, fillOpacity: 1, weight: 2 }}
          >
            <Popup>
              <div className="world-pop">
                <div className="world-pop-route">{e.where}</div>
                {(e.from || e.what) && (
                  <div className="world-pop-flight">
                    {[e.from && `${e.from}${e.to ? `–${e.to}` : ''}`, e.what].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {runs.map((r, i) => (
          <Polyline key={i} positions={r.coords} pathOptions={{ color: r.color || GREEN, weight: 3, opacity: 0.9 }}>
            <Popup>
              <div className="world-pop">
                <div className="world-pop-route">{words(r.sport).icon} {r.label}</div>
                <div className="world-pop-flight">
                  {r.distance_km} km{r.pace ? ` · ${r.pace}` : ''}
                </div>
              </div>
            </Popup>
          </Polyline>
        ))}

        {visits.map((v, i) => (
          <CircleMarker
            key={i}
            center={[v.lat, v.lon]}
            radius={6}
            pathOptions={{ color: '#FFFFFF', fillColor: GOLD, fillOpacity: 0.95, weight: 1.5 }}
          >
            <Popup>
              <div className="world-pop">
                <div className="world-pop-route">
                  {v.t} – {v.e}
                </div>
                <div className="world-pop-flight">stopped here · {fmtDur(v.min)}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {visits.length > 0 && (
        <div className="daymap-strip">
          {visits.map((v, i) => (
            <span key={i} className="daymap-stop">
              <span className="daymap-stop-t">{v.t}</span> {fmtDur(v.min)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
