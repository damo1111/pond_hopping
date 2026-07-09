import { useContext, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import { boundsExcludingHome } from '../lib/geo.js'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'hotel', label: 'Hotels' },
  { id: 'run', label: 'Runs' },
  { id: 'highlight', label: 'Highlights' },
]

const KIND_STYLE = {
  hotel: { color: '#A8842C', fill: '#A8842C' },
  run: { color: '#3E7D54', fill: '#3E7D54' },
  highlight: { color: '#C0392B', fill: '#C0392B' },
  place: { color: '#8B8375', fill: '#8B8375' },
}

// Pins have no date of their own, so match by trip + city (first entry,
// by date, with that city). Runs carry a run_date, so that's an exact
// match against entry_date.
function findJournalMatch(journal, tripId, { city, date } = {}) {
  if (date) {
    const m = journal.find((e) => e.trip_id === tripId && e.entry_date === date)
    if (m) return m
  }
  if (city) {
    const m = journal.find((e) => e.trip_id === tripId && e.city?.toLowerCase() === city.toLowerCase())
    if (m) return m
  }
  return null
}

export default function MapTab() {
  const { tripMeta, selectedTrip, jumpToJournal } = useContext(TripContext)
  const [pins, setPins] = useState(null)
  const [runs, setRuns] = useState(null)
  const [journal, setJournal] = useState(null)
  const [filter, setFilter] = useState('all')
  const [drawLen, setDrawLen] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('map_pins').select('*'),
      supabase.from('runs').select('id,trip_id,label,city,distance_km,pace,color,coords,run_date'),
      supabase.from('journal_entries').select('trip_id,entry_date,city,title,lat,lon').order('entry_date'),
    ]).then(([p, r, j]) => {
      if (!alive) return
      setPins(p.data ?? [])
      setRuns(r.data ?? [])
      setJournal(j.data ?? [])
    })
    return () => {
      alive = false
    }
  }, [])

  const tripsById = useMemo(() => new Map(tripMeta.map((t) => [t.id, t])), [tripMeta])
  const inTrip = (row) => !selectedTrip || tripsById.get(row.trip_id)?.slug === selectedTrip

  // Draw the journey line on progressively (point by point) whenever the
  // trip selection changes, echoing the globe's animated arcs, instead of
  // the whole route just appearing.
  useEffect(() => {
    setDrawLen(0)
    if (filter !== 'all' || !journal || !tripMeta.length) return
    const total = journal.filter(
      (e) => inTrip(e) && e.lat != null && e.lon != null
    ).length
    if (total < 2) return
    let raf
    const start = performance.now()
    const duration = Math.min(2200, 500 + total * 80)
    function tick(now) {
      const t = Math.min(1, (now - start) / duration)
      setDrawLen(Math.max(2, Math.round(t * total)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, selectedTrip, journal, tripMeta])

  if (!pins || !runs || !journal) return <div className="tab-loading">loading map…</div>

  const showPinKind = (k) => filter === 'all' || filter === k
  const visPins = pins.filter((p) => inTrip(p) && showPinKind(p.kind))
  const visRuns = filter === 'all' || filter === 'run' ? runs.filter(inTrip) : []
  const visJournal = journal.filter((e) => inTrip(e) && e.lat != null && e.lon != null)

  const boundsPts = [
    ...visPins.map((p) => [p.lat, p.lon]),
    ...visRuns.flatMap((r) => [r.coords[0], r.coords[r.coords.length - 1]]),
    ...(filter === 'all' ? visJournal.map((e) => [e.lat, e.lon]) : []),
  ]
  // Home-country pins/entries (e.g. an airport dinner in Brisbane) shouldn't
  // pull the auto-fit back toward Australia and shrink the actual trip.
  const bounds = boundsExcludingHome(boundsPts) ?? [[-40, 100], [45, 155]]

  return (
    <div className="world-wrap">
      <MapContainer
        key={`${filter}-${selectedTrip || 'all'}`} /* remount to refit bounds on filter change */
        bounds={bounds}
        boundsOptions={{ padding: [30, 30] }}
        zoomControl={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%', background: '#EDE9DF' }}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" />

        {/* journey line through journal entries, date order */}
        {filter === 'all' && visJournal.length > 1 && (
          <Polyline
            positions={visJournal.slice(0, Math.max(2, drawLen)).map((e) => [e.lat, e.lon])}
            pathOptions={{ color: '#1A1611', weight: 1, dashArray: '2 6', opacity: 0.4 }}
          />
        )}

        {/* GPS run tracks in their stored colours */}
        {visRuns.map((r) => {
          const match = findJournalMatch(journal, r.trip_id, { date: r.run_date })
          return (
            <Polyline
              key={r.id}
              positions={r.coords}
              pathOptions={{ color: r.color || '#3E7D54', weight: 3, opacity: 0.85 }}
            >
              <Popup>
                <div className="world-pop">
                  <div className="world-pop-route">{r.label}</div>
                  <div className="world-pop-flight">
                    {r.distance_km} km{r.pace ? ` · ${r.pace}` : ''}
                  </div>
                  {match && (
                    <button
                      className="map-pop-jump"
                      onClick={() => jumpToJournal(tripsById.get(r.trip_id)?.slug, match.entry_date)}
                    >
                      → view in journal
                    </button>
                  )}
                </div>
              </Popup>
            </Polyline>
          )
        })}
        {visRuns.map((r) => (
          <CircleMarker
            key={`s-${r.id}`}
            center={r.coords[0]}
            radius={4}
            pathOptions={{ color: '#FFFFFF', fillColor: '#3E7D54', fillOpacity: 1, weight: 1.5 }}
          />
        ))}

        {/* pins */}
        {visPins.map((p) => {
          const st = KIND_STYLE[p.kind] || KIND_STYLE.place
          const match = findJournalMatch(journal, p.trip_id, { city: p.city })
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lon]}
              radius={6}
              pathOptions={{ color: '#FFFFFF', fillColor: st.fill, fillOpacity: 0.95, weight: 1.5 }}
            >
              <Popup>
                <div className="world-pop">
                  <div className="world-pop-route">{p.label}</div>
                  <div className="world-pop-flight">
                    {p.kind}
                    {p.city ? ` · ${p.city}` : ''}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </div>
                  {match && (
                    <button
                      className="map-pop-jump"
                      onClick={() => jumpToJournal(tripsById.get(p.trip_id)?.slug, match.entry_date)}
                    >
                      → view in journal
                    </button>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>

      <div className="map-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`map-chip${filter === f.id ? ' active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}
