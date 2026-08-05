import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet'

// A run drawn on nothing is a squiggle. On a map it's a route — you can see it
// followed a river, or went up and came back down the same street.
//
// Positron rather than the Voyager basemap the rest of the app uses: it's
// nearly greyscale, so a coloured line sits on top of it instead of competing
// with the roads. That is the same reason Strava's basemap is muted.
const TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

export default function RunMap({ coords, color = '#3E7D54', height = 240 }) {
  const pts = (coords || []).filter((c) => Array.isArray(c) && c.length >= 2)
  if (pts.length < 2) return null

  const lats = pts.map((c) => c[0])
  const lons = pts.map((c) => c[1])
  // A there-and-back along one street has no width; pad it so Leaflet gets a
  // box it can fit rather than a point it zooms to maximum on.
  const pad = 0.0008
  const bounds = [
    [Math.min(...lats) - pad, Math.min(...lons) - pad],
    [Math.max(...lats) + pad, Math.max(...lons) + pad],
  ]

  return (
    <div className="run-map">
      {/* Inert, like the journal's day map and for the same reason: this sits
          inside a list you scroll, and a finger landing on it should keep
          scrolling rather than drag Seoul out of frame. */}
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [16, 16] }}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        scrollWheelZoom={false}
        touchZoom={false}
        doubleClickZoom={false}
        boxZoom={false}
        keyboard={false}
        style={{ height, width: '100%', background: '#EDE9DF' }}
      >
        <TileLayer url={TILES} subdomains="abcd" />

        {/* Casing then core. A single stroke disappears wherever it crosses a
            road of similar tone; a white halo under it keeps the whole route
            legible over parks, water and streets alike. */}
        <Polyline positions={pts} pathOptions={{ color: '#FFFFFF', weight: 6.5, opacity: 0.95, lineCap: 'round' }} />
        <Polyline positions={pts} pathOptions={{ color, weight: 3.5, opacity: 1, lineCap: 'round' }} />

        {/* Where it started and where it stopped — an out-and-back and a loop
            look identical without them. */}
        <CircleMarker
          center={pts[0]}
          radius={5}
          pathOptions={{ color: '#FFFFFF', fillColor: color, fillOpacity: 1, weight: 2 }}
        />
        <CircleMarker
          center={pts[pts.length - 1]}
          radius={5}
          pathOptions={{ color, fillColor: '#FFFFFF', fillOpacity: 1, weight: 2.5 }}
        />
      </MapContainer>
    </div>
  )
}
