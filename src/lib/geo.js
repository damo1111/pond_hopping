/**
 * Great-circle path between two [lat, lon] points.
 * Returns an array of [lat, lon] pairs suitable for a Leaflet polyline.
 * Interpolates along the sphere so long-haul routes curve properly.
 */
export function greatCircle(from, to, segments = 64) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI

  const lat1 = toRad(from[0])
  const lon1 = toRad(from[1])
  const lat2 = toRad(to[0])
  const lon2 = toRad(to[1])

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
      )
    )

  if (d === 0) return [from, to]

  const points = []
  for (let i = 0; i <= segments; i++) {
    const f = i / segments
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    points.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))])
  }

  // Unwrap longitudes so routes crossing the antimeridian don't zig-zag
  for (let i = 1; i < points.length; i++) {
    let prev = points[i - 1][1]
    while (points[i][1] - prev > 180) points[i][1] -= 360
    while (points[i][1] - prev < -180) points[i][1] += 360
  }

  return points
}

// Rough Australia bounding box. Every trip starts/ends at home, so letting
// the home point drive the auto-fit squashes the actual destination — this
// lets bounds-fitting drop home points while still rendering their routes/pins.
export function isInAustralia([lat, lon]) {
  return lat >= -44 && lat <= -10 && lon >= 112 && lon <= 154
}

// Broad Asia-Pacific box covering every trip's actual destinations. The
// Sri Lanka voyage's Berlin/London origin leg is the one outlier outside
// it — left in for home-view bounds, it alone forces the whole map to
// zoom out to near-global width to fit a single flight's start point.
function isInAsiaPacificFocus([lat, lon]) {
  return lat >= -50 && lat <= 40 && lon >= 60 && lon <= 185
}

/**
 * Points to fit the map to, biased away from home (Australia) and from
 * far-flung one-off outliers (e.g. a single trip's European origin leg):
 * drops them from the fit unless that would leave nothing to fit on.
 * Routes/pins for dropped points still render — they just don't dictate
 * the zoom/pan.
 */
export function boundsExcludingHome(points) {
  if (!points.length) return null
  const focused = points.filter((p) => !isInAustralia(p) && isInAsiaPacificFocus(p))
  if (focused.length) return focused
  const away = points.filter((p) => !isInAustralia(p))
  return away.length ? away : points
}

/** Distance between two [lat, lon] points in km (haversine). */
export function distanceKm(from, to) {
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(to[0] - from[0])
  const dLon = toRad(to[1] - from[1])
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from[0])) * Math.cos(toRad(to[0])) * Math.sin(dLon / 2) ** 2
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)))
}
