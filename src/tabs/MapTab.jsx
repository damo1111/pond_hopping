import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import { boundsExcludingHome } from '../lib/geo.js'
import { thumb } from '../lib/imgTransform.js'
import { tripColor } from '../lib/tripColors.js'
import { clusterPoints } from '../lib/clusterPoints.js'
import Icon from '../components/Icon.jsx'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'hotel', label: 'Hotels' },
  { id: 'run', label: 'Runs' },
  { id: 'highlight', label: 'Highlights' },
  { id: 'photo', label: 'Photos' },
]

const TILE_STYLES = {
  map: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
}

// A badge for a cluster of overlapping points — tap to zoom in and split it
// back into individual pins/photos.
//
// It reads "×4", not "4". A bare numeral in a circle on a map of a trip is
// read as the fourth stop — David, 12 August: "missing 1 & 2 on the map" —
// and the two unnumbered dots nearby make that reading look confirmed rather
// than wrong. There is no first or second: these are counts of things
// sitting on top of each other, and the multiplication sign is the shortest
// way to say so.
function clusterIcon(count, color) {
  return L.divIcon({
    className: 'map-cluster-icon',
    html: `<div class="map-cluster-badge" style="--cluster-color:${color}" aria-label="${count} here">
             <span class="map-cluster-x">\u00d7</span>${count}
           </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

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
  const { tripMeta, selectedTrip, jumpToJournal, userId } = useContext(TripContext)
  const [pins, setPins] = useState(null)
  const [runs, setRuns] = useState(null)
  const [journal, setJournal] = useState(null)
  const [photos, setPhotos] = useState(null)
  const [filter, setFilter] = useState('all')
  const [drawLen, setDrawLen] = useState(0)
  const [photoDrawLen, setPhotoDrawLen] = useState(0)
  const [zoom, setZoom] = useState(11)
  const [tileStyle, setTileStyle] = useState('map')
  // Tapping a pin used to pop a Leaflet balloon: no animation, tethered to
  // the marker, and half of it off-screen near an edge. It's a card about
  // one thing, so it comes up from the bottom like the recap's sheets do.
  const [preview, setPreview] = useState(null)
  const mapRef = useRef(null)
  const accent = tripColor(selectedTrip)
  const showPhotos = filter === 'all' || filter === 'photo'

  // Zoom in on a cluster badge — splits it back into individual pins once
  // there's enough room, rather than needing a popup list.
  function expandCluster(lat, lon) {
    mapRef.current?.flyTo([lat, lon], Math.min(zoom + 3, 16), { duration: 0.8 })
  }

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('map_pins').select('*'),
      supabase.from('runs').select('id,trip_id,label,city,distance_km,pace,color,coords,run_date,sport'),
      supabase
        .from('journal_entries')
        .select('trip_id,entry_date,city,title,lat,lon,mood,day_number')
        .order('entry_date'),
      supabase
        .from('photos')
        .select('id,trip_id,lat,lon,taken_at,url,caption,thumb_url')
        // A photograph of a bill is not a place you went.
        .neq('kind', 'receipt')
        .not('lat', 'is', null)
        .order('taken_at'),
    ]).then(([p, r, j, ph]) => {
      if (!alive) return
      setPins(p.data ?? [])
      setRuns(r.data ?? [])
      setJournal(j.data ?? [])
      setPhotos(ph.data ?? [])
    })
    return () => {
      alive = false
    }
    // Keyed on userId because restoring a session is asynchronous: a read
    // fired at mount goes out before the token exists, comes back answered
    // as an anonymous request, and this loaded empty and never tried again.
  }, [userId])

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

  // Same progressive draw-on, but for the photo-GPS trail — the fallback
  // route for trips with no Google Timeline export (journal entries still
  // carry a per-day pin, but the trail itself comes from photos.lat/lon).
  useEffect(() => {
    setPhotoDrawLen(0)
    if (!showPhotos || !photos || !tripMeta.length) return
    const total = photos.filter((p) => inTrip(p)).length
    if (total < 2) return
    let raf
    const start = performance.now()
    const duration = Math.min(2200, 500 + total * 15)
    function tick(now) {
      const t = Math.min(1, (now - start) / duration)
      setPhotoDrawLen(Math.max(2, Math.round(t * total)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, selectedTrip, photos, tripMeta])

  if (!pins || !runs || !journal || !photos) return <div className="tab-loading">loading map…</div>

  const showPinKind = (k) => filter === 'all' || filter === k
  const visPins = pins.filter((p) => inTrip(p) && showPinKind(p.kind))
  const visRuns = filter === 'all' || filter === 'run' ? runs.filter(inTrip) : []
  const visJournal = journal.filter((e) => inTrip(e) && e.lat != null && e.lon != null)
  const visPhotos = showPhotos ? photos.filter((p) => inTrip(p)) : []
  // One chip per day that has either a journal entry or dated photos, for
  // the scrubber to fly the map to — keyed off journal_entries since every
  // day (Timeline-backed or reconstructed from EXIF) has exactly one.
  const dayChips = selectedTrip && filter === 'all' ? visJournal : []

  const boundsPts = [
    ...visPins.map((p) => [p.lat, p.lon]),
    ...visRuns.flatMap((r) => [r.coords[0], r.coords[r.coords.length - 1]]),
    ...(filter === 'all' ? visJournal.map((e) => [e.lat, e.lon]) : []),
    ...visPhotos.map((p) => [p.lat, p.lon]),
  ]
  // Home-country pins/entries (e.g. an airport dinner in Brisbane) shouldn't
  // pull the auto-fit back toward Australia and shrink the actual trip.
  const bounds = boundsExcludingHome(boundsPts) ?? [[-40, 100], [45, 155]]

  const visPhotosDrawn = showPhotos ? visPhotos.slice(0, Math.max(2, photoDrawLen)) : []
  // Collapse overlapping pins/photos into numbered badges at the current
  // zoom — a dense trip (or the "all trips" view) otherwise stacks dozens
  // of dots illegibly on top of each other.
  const pinClusters = clusterPoints(visPins, zoom)
  // Clustered from every photo, not from the slice the trail is currently
  // drawing. The draw-on exists to animate the *line*; feeding it to the
  // markers too meant each cluster gained members frame by frame, so its
  // count ticked up and its centroid crawled sixty times a second for the
  // length of the animation. The markers are where the photos are from the
  // first frame; the line catches up.
  const photoClusters = clusterPoints(visPhotos, zoom)

  return (
    <div className="world-wrap">
      <MapContainer
        key={`${filter}-${selectedTrip || 'all'}`} /* remount to refit bounds on filter change */
        ref={mapRef}
        bounds={bounds}
        boundsOptions={{ padding: [30, 30] }}
        zoomControl={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%', background: '#EDE9DF' }}
        whenReady={() => {
          const m = mapRef.current
          if (!m) return
          setZoom(m.getZoom())
          m.on('zoomend', () => setZoom(m.getZoom()))
          // Tapping the map itself puts the card away, the way dismissing
          // anything on a map should work.
          m.on('click', () => setPreview(null))
        }}
      >
        <TileLayer url={TILE_STYLES[tileStyle]} subdomains={tileStyle === 'map' ? 'abcd' : undefined} />

        {/* journey line through journal entries, date order */}
        {filter === 'all' && visJournal.length > 1 && (
          <Polyline
            positions={visJournal.slice(0, Math.max(2, drawLen)).map((e) => [e.lat, e.lon])}
            pathOptions={{ color: '#1A1611', weight: 1, dashArray: '2 6', opacity: 0.4 }}
          />
        )}

        {/* photo-GPS trail — the route itself for trips with no Google
            Timeline export, since journal entries there only carry one
            pin per day rather than a real path. Tinted with the selected
            trip's own accent colour instead of a flat gold. */}
        {showPhotos && visPhotos.length > 1 && (
          <Polyline
            positions={visPhotosDrawn.map((p) => [p.lat, p.lon])}
            pathOptions={{ color: accent, weight: 1.5, opacity: 0.5 }}
          />
        )}
        {showPhotos &&
          photoClusters.map((c) => {
            if (c.type === 'cluster') {
              return (
                <Marker
                  key={`phc-${c.key}`}
                  position={[c.lat, c.lon]}
                  icon={clusterIcon(c.points.length, accent)}
                  eventHandlers={{ click: () => expandCluster(c.lat, c.lon) }}
                />
              )
            }
            const p = c.point
            const match = findJournalMatch(journal, p.trip_id, { date: p.taken_at?.slice(0, 10) })
            return (
              <CircleMarker
                key={`ph-${p.id}`}
                center={[p.lat, p.lon]}
                radius={3.5}
                pathOptions={{ color: accent, fillColor: accent, fillOpacity: 0.85, weight: 0 }}
                eventHandlers={{
                  click: () =>
                    setPreview({
                      id: `ph-${p.id}`,
                      img: p.thumb_url || thumb(p.url, { width: 320, height: 320 }),
                      title: p.caption || tripsById.get(p.trip_id)?.title || 'Photo',
                      sub: new Date(p.taken_at).toLocaleString('en-GB', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      }),
                      jump: match && { slug: tripsById.get(p.trip_id)?.slug, date: match.entry_date },
                    }),
                }}
              />
            )
          })}

        {/* GPS run tracks in their stored colours */}
        {visRuns.map((r) => {
          const match = findJournalMatch(journal, r.trip_id, { date: r.run_date })
          return (
            <Polyline
              key={r.id}
              positions={r.coords}
              pathOptions={{ color: r.color || '#3E7D54', weight: 3, opacity: 0.85 }}
              eventHandlers={{
                click: () =>
                  setPreview({
                    id: `run-${r.id}`,
                    accent: r.color || '#3E7D54',
                    title: r.label,
                    sub: `${r.distance_km} km${r.pace ? ` · ${r.pace}` : ''}`,
                    jump: match && { slug: tripsById.get(r.trip_id)?.slug, date: match.entry_date },
                  }),
              }}
            />
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
        {pinClusters.map((c) => {
          if (c.type === 'cluster') {
            const kinds = new Set(c.points.map((p) => p.kind))
            const badgeColor = kinds.size === 1 ? (KIND_STYLE[c.points[0].kind] || KIND_STYLE.place).fill : '#1A1611'
            return (
              <Marker
                key={`pc-${c.key}`}
                position={[c.lat, c.lon]}
                icon={clusterIcon(c.points.length, badgeColor)}
                eventHandlers={{ click: () => expandCluster(c.lat, c.lon) }}
              />
            )
          }
          const p = c.point
          const st = KIND_STYLE[p.kind] || KIND_STYLE.place
          const match = findJournalMatch(journal, p.trip_id, { city: p.city })
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lon]}
              radius={6}
              pathOptions={{ color: '#FFFFFF', fillColor: st.fill, fillOpacity: 0.95, weight: 1.5 }}
              eventHandlers={{
                click: () =>
                  setPreview({
                    id: `pin-${p.id}`,
                    accent: st.fill,
                    title: p.label,
                    sub: [p.kind, p.city, p.notes].filter(Boolean).join(' · '),
                    jump: match && { slug: tripsById.get(p.trip_id)?.slug, date: match.entry_date },
                  }),
              }}
            />
          )
        })}
      </MapContainer>

      <button
        className="map-style-toggle"
        onClick={() => setTileStyle((s) => (s === 'map' ? 'satellite' : 'map'))}
        title={tileStyle === 'map' ? 'Switch to satellite' : 'Switch to map'}
      >
        {tileStyle === 'map' ? '🛰️' : '🗺️'}
      </button>

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

      {/* The card lands where the scrubber lives; the scrubber steps aside
          rather than the two fighting over the bottom of the screen. */}
      {dayChips.length > 1 && !preview && (
        <div className="map-day-scrub" style={{ '--map-accent': accent }}>
          {dayChips.map((e) => (
            <button
              key={e.entry_date}
              className="map-ds-chip"
              onClick={() => mapRef.current?.flyTo([e.lat, e.lon], 13, { duration: 1.1 })}
            >
              {/* Was an emoji over "D7". The scrubber still has a job here
                  — it flies the map to that day — but a date is what
                  someone is actually looking for. */}
              <span className="map-ds-day">
                {new Date(e.entry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            </button>
          ))}
        </div>
      )}

      {preview && (
        /* Keyed on the item so tapping straight from one pin to another
           replays the rise rather than swapping the text in place. */
        <div className="map-preview" key={preview.id} style={{ '--pv-accent': preview.accent || accent }}>
          {preview.img && <img className="map-preview-img" src={preview.img} alt="" />}
          <div className="map-preview-body">
            <div className="map-preview-title">{preview.title}</div>
            <div className="map-preview-sub">{preview.sub}</div>
            {preview.jump?.slug && (
              <button
                className="map-preview-jump"
                onClick={() => jumpToJournal(preview.jump.slug, preview.jump.date)}
              >
                Read that day
              </button>
            )}
          </div>
          <button className="map-preview-close" onClick={() => setPreview(null)} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
