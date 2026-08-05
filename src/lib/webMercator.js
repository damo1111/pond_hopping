// Enough Web Mercator to put a real map behind a 96×64 thumbnail.
//
// A Leaflet instance per row would be the obvious way and the wrong one: five
// runs is five maps, each with its own event handlers, layers and animation
// frames, inside a list we just spent two commits making scroll smoothly.
// A thumbnail doesn't pan or zoom — it only needs the right pixels. So this
// works out which tiles cover the route, where to nail them down, and where
// the route falls across them, and the row renders a few <img>s and a path.

const TILE = 256

/** Longitude → world pixel x at this zoom. */
export const lonToX = (lon, z) => ((lon + 180) / 360) * TILE * 2 ** z

/** Latitude → world pixel y at this zoom (clamped to Mercator's limits). */
export function latToY(lat, z) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const rad = (clamped * Math.PI) / 180
  const merc = Math.log(Math.tan(Math.PI / 4 + rad / 2))
  return (0.5 - merc / (2 * Math.PI)) * TILE * 2 ** z
}

/**
 * The frame for a route drawn into a w×h box: which zoom fits it, which tiles
 * to fetch, where each one sits, and the SVG path in box coordinates.
 *
 * @returns {null | { zoom, tiles: Array<{x,y,z,left,top}>, path: string }}
 */
export function tileFrame(coords, w, h, { pad = 8, maxZoom = 16, minZoom = 1 } = {}) {
  const pts = (coords || []).filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])
  )
  if (pts.length < 2 || !(w > 0) || !(h > 0)) return null

  const innerW = Math.max(1, w - pad * 2)
  const innerH = Math.max(1, h - pad * 2)

  // Largest zoom at which the whole route still fits. Going up a zoom doubles
  // the pixel span, so walking down from the top finds it in a few steps.
  let zoom = minZoom
  for (let z = maxZoom; z >= minZoom; z--) {
    const xs = pts.map((p) => lonToX(p[1], z))
    const ys = pts.map((p) => latToY(p[0], z))
    if (Math.max(...xs) - Math.min(...xs) <= innerW && Math.max(...ys) - Math.min(...ys) <= innerH) {
      zoom = z
      break
    }
  }

  const xs = pts.map((p) => lonToX(p[1], zoom))
  const ys = pts.map((p) => latToY(p[0], zoom))
  // Centre the route in the box rather than anchoring it to a corner: a run
  // that hugs one edge of its own bounding box still sits in the middle.
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const left = cx - w / 2
  const top = cy - h / 2

  const n = 2 ** zoom
  const tiles = []
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + h) / TILE); ty++) {
      // Rows outside the world have no tile; columns wrap, because a route
      // either side of the date line is a real thing.
      if (ty < 0 || ty >= n) continue
      tiles.push({
        x: ((tx % n) + n) % n,
        y: ty,
        z: zoom,
        left: tx * TILE - left,
        top: ty * TILE - top,
      })
    }
  }

  const path = pts
    .map((_, i) => `${i ? 'L' : 'M'}${(xs[i] - left).toFixed(1)} ${(ys[i] - top).toFixed(1)}`)
    .join(' ')

  return { zoom, tiles, path }
}
