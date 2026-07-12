// Lightweight grid-based clustering for map pins/photos — groups points
// that would otherwise stack on top of each other at the current zoom
// into a single numbered badge, without pulling in a full clustering
// library. The grid shrinks as you zoom in, so clusters naturally split
// back into individual points once there's room to show them.
export function clusterPoints(points, zoom) {
  const cellDeg = 8 / Math.pow(2, zoom)
  const cells = new Map()
  for (const p of points) {
    const key = `${Math.round(p.lat / cellDeg)}:${Math.round(p.lon / cellDeg)}`
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(p)
  }
  return [...cells.values()].map((group) => {
    if (group.length === 1) return { type: 'single', point: group[0] }
    const lat = group.reduce((s, p) => s + p.lat, 0) / group.length
    const lon = group.reduce((s, p) => s + p.lon, 0) / group.length
    return { type: 'cluster', lat, lon, points: group }
  })
}
