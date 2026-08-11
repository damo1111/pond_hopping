// Where to point the globe at someone who hasn't been anywhere yet.
//
// The overview framing is hardcoded to the Asia-Pacific because that's where
// most of *this* account's travel happened. For a first-time user in London
// that's a slow spin over the Banda Sea, which says nothing to them at all.
//
// The browser's time zone is the cheapest honest guess at where somebody is:
// no permission prompt, no geolocation dialog on first run, and wrong only
// by a city rather than by a hemisphere. Good enough to point a globe.

// Deliberately coarse — a capital or major city per zone. This is choosing a
// camera angle, not placing a pin on a map.
const ZONES = {
  'Europe/London': [51.5, -0.1],
  'Europe/Dublin': [53.3, -6.3],
  'Europe/Paris': [48.9, 2.4],
  'Europe/Madrid': [40.4, -3.7],
  'Europe/Lisbon': [38.7, -9.1],
  'Europe/Berlin': [52.5, 13.4],
  'Europe/Amsterdam': [52.4, 4.9],
  'Europe/Brussels': [50.9, 4.4],
  'Europe/Zurich': [47.4, 8.5],
  'Europe/Vienna': [48.2, 16.4],
  'Europe/Rome': [41.9, 12.5],
  'Europe/Athens': [38.0, 23.7],
  'Europe/Stockholm': [59.3, 18.1],
  'Europe/Oslo': [59.9, 10.8],
  'Europe/Copenhagen': [55.7, 12.6],
  'Europe/Helsinki': [60.2, 24.9],
  'Europe/Warsaw': [52.2, 21.0],
  'Europe/Prague': [50.1, 14.4],
  'Europe/Budapest': [47.5, 19.0],
  'Europe/Istanbul': [41.0, 29.0],
  'Europe/Moscow': [55.8, 37.6],
  'Europe/Kyiv': [50.5, 30.5],
  'America/New_York': [40.7, -74.0],
  'America/Toronto': [43.7, -79.4],
  'America/Chicago': [41.9, -87.6],
  'America/Denver': [39.7, -105.0],
  'America/Los_Angeles': [34.1, -118.2],
  'America/Vancouver': [49.3, -123.1],
  'America/Phoenix': [33.4, -112.1],
  'America/Mexico_City': [19.4, -99.1],
  'America/Bogota': [4.7, -74.1],
  'America/Lima': [-12.0, -77.0],
  'America/Santiago': [-33.4, -70.7],
  'America/Sao_Paulo': [-23.5, -46.6],
  'America/Argentina/Buenos_Aires': [-34.6, -58.4],
  'Asia/Tokyo': [35.7, 139.7],
  'Asia/Seoul': [37.6, 127.0],
  'Asia/Shanghai': [31.2, 121.5],
  'Asia/Hong_Kong': [22.3, 114.2],
  'Asia/Taipei': [25.0, 121.6],
  'Asia/Singapore': [1.4, 103.8],
  'Asia/Bangkok': [13.8, 100.5],
  'Asia/Jakarta': [-6.2, 106.8],
  'Asia/Manila': [14.6, 121.0],
  'Asia/Kolkata': [22.6, 88.4],
  'Asia/Karachi': [24.9, 67.0],
  'Asia/Dubai': [25.2, 55.3],
  'Asia/Qatar': [25.3, 51.5],
  'Asia/Riyadh': [24.7, 46.7],
  'Asia/Jerusalem': [31.8, 35.2],
  'Africa/Cairo': [30.0, 31.2],
  'Africa/Lagos': [6.5, 3.4],
  'Africa/Nairobi': [-1.3, 36.8],
  'Africa/Johannesburg': [-26.2, 28.0],
  'Australia/Sydney': [-33.9, 151.2],
  'Australia/Melbourne': [-37.8, 145.0],
  'Australia/Brisbane': [-27.5, 153.0],
  'Australia/Perth': [-31.9, 115.9],
  'Australia/Adelaide': [-34.9, 138.6],
  'Pacific/Auckland': [-36.9, 174.8],
  'Pacific/Honolulu': [21.3, -157.9],
  'Pacific/Fiji': [-18.1, 178.4],
}

// A zone we don't know by name still tells us a continent, which is a far
// better camera angle than the wrong hemisphere.
const REGIONS = {
  Europe: [50.0, 10.0],
  America: [39.0, -95.0],
  Asia: [30.0, 100.0],
  Africa: [2.0, 20.0],
  Australia: [-25.0, 134.0],
  Pacific: [-20.0, 175.0],
  Atlantic: [38.0, -28.0],
  Indian: [-10.0, 75.0],
}

// Mid-Atlantic: no continent implied, nothing claimed. Used when the browser
// won't say where it is at all.
const NOWHERE = [25.0, -35.0]

export function homeCoords(timeZone) {
  const zone =
    timeZone ??
    (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch {
        return null
      }
    })()

  if (!zone) return { lat: NOWHERE[0], lng: NOWHERE[1], known: false }

  const exact = ZONES[zone]
  if (exact) return { lat: exact[0], lng: exact[1], known: true }

  const region = REGIONS[zone.split('/')[0]]
  if (region) return { lat: region[0], lng: region[1], known: true }

  return { lat: NOWHERE[0], lng: NOWHERE[1], known: false }
}

export function homePov(timeZone, altitude = 1.9) {
  const { lat, lng } = homeCoords(timeZone)
  return { lat, lng, altitude }
}

/**
 * Where to point the globe so that what somebody can actually see is on it.
 *
 * The overview used to be a constant — lat -8, lng 122, which is Indonesia.
 * It was tuned to one collection, and it was wrong for anybody else's: a
 * signed-out visitor sees the two example trips, both of them in Europe, and
 * the earth opened on an empty stretch of the Java Sea with nothing on it at
 * all. The globe is the first thing anybody sees and it was pointing away
 * from the only things it had to show.
 *
 * Longitude is averaged as an angle rather than a number, which is the part
 * that is easy to get wrong and impossible to notice on one person's data. A
 * trip to Auckland at 174° and one to Los Angeles at −118° average
 * arithmetically to 28° — Egypt, a quarter of the world from either. Summing
 * the unit vectors and taking the direction back out puts the camera in the
 * Pacific, between them, which is where somebody standing back would be.
 *
 * @param points  [lat, lng] pairs — airports, stops, anywhere real
 * @param fallback used when there is nothing to average
 */
export function overviewOf(points = [], fallback = null) {
  const real = (points ?? []).filter(
    (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
  )
  if (!real.length) return fallback

  const rad = Math.PI / 180
  let x = 0
  let y = 0
  let lat = 0
  for (const [a, o] of real) {
    lat += a
    x += Math.cos(o * rad)
    y += Math.sin(o * rad)
  }
  // Every point diametrically opposed to another leaves no direction at all.
  // Rare, and a real answer is not available — so say so rather than return
  // an arbitrary meridian.
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return fallback

  return {
    lat: Math.round((lat / real.length) * 100) / 100,
    lng: Math.round((Math.atan2(y, x) / rad) * 100) / 100,
  }
}
