// Lightweight grid-based clustering for map pins/photos — groups points
// that would otherwise stack on top of each other at the current zoom
// into a single badge, without pulling in a full clustering library. The
// grid shrinks as you zoom in, so clusters naturally split back into
// individual points once there's room to show them.
//
// Every group carries the grid cell it came from. That cell is the one thing
// about a cluster that does not move while points are being added to it —
// the centroid does, on every single point — and React needs a key that
// holds still. Keyed on the centroid, a cluster gaining a member is not the
// same cluster any more: Leaflet tears the marker out of the map and builds
// a new one, sixty times a second for the length of the draw-on. Which is
// what "the number keeps spinning frenetically" was.
export function clusterPoints(points, zoom) {
  const cellDeg = 8 / Math.pow(2, zoom)
  const cells = new Map()
  for (const p of points) {
    const key = `${Math.round(p.lat / cellDeg)}:${Math.round(p.lon / cellDeg)}`
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(p)
  }
  return [...cells.entries()].map(([key, group]) => {
    if (group.length === 1) return { type: 'single', key, point: group[0] }
    const lat = group.reduce((s, p) => s + p.lat, 0) / group.length
    const lon = group.reduce((s, p) => s + p.lon, 0) / group.length
    return { type: 'cluster', key, lat, lon, points: group }
  })
}
