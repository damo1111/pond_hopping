// Turning "home is the UK" into a point on the earth.
//
// Two things in this app know about home and neither of them was enough on
// its own.
//
// homePov's homeCoords() reads the phone's timezone. It is the right answer
// for pointing a globe and the wrong one for this, because a phone in Banff
// says America/Edmonton — so the very people the trip offer exists for, who
// installed the app *while abroad*, would have been measured against a home
// eight time zones from the one they actually left. Every photograph would
// have been "near home" and nothing would ever have been offered.
//
// home.js knows the answer somebody actually gave — a country code, from the
// pond question. It is right about the country and says nothing about where
// on the earth that is.
//
// So: the stated country decides, and the timezone is allowed to sharpen it
// when the two agree. Somebody at home in London gets London; somebody who
// said "the UK" from a hotel in Alberta gets London too, by way of the
// capital, which is close enough when the thing being measured is six
// thousand kilometres.
//
// ── What it will not do ───────────────────────────────────────────────────
//
// Never guesses the country. If nobody has said where home is, this says it
// does not know, and spotTrip refuses to offer anything at all. That is the
// deliberate trade: silence costs one tap on "add a trip", and a wrong offer
// teaches somebody the app guesses badly.

import { guessHome } from './homePond.js'
import { zonePoint } from './homePov.js'

/**
 * A city per country, for when the phone is somewhere else.
 *
 * Capitals rather than geometric centroids, because a person is not evenly
 * distributed across their country: the middle of Canada is a lake and the
 * middle of Australia is a desert, and neither is anybody's home. This only
 * ever gets used when somebody is abroad — when they are home the timezone
 * gives their own city — so being out by a few hundred kilometres inside the
 * right country costs nothing against a threshold of two hundred and fifty.
 *
 * Not every country is here. A country that isn't means no offer rather than
 * a bad one, which is the same rule as everywhere else in this feature.
 */
export const CAPITALS = {
  ad: [42.5, 1.5], ae: [24.5, 54.4], af: [34.5, 69.2], al: [41.3, 19.8], am: [40.2, 44.5],
  ao: [-8.8, 13.2], ar: [-34.6, -58.4], at: [48.2, 16.4], au: [-35.3, 149.1], az: [40.4, 49.9],
  ba: [43.9, 18.4], bd: [23.8, 90.4], be: [50.9, 4.4], bf: [12.4, -1.5], bg: [42.7, 23.3],
  bh: [26.2, 50.6], bj: [6.5, 2.6], bn: [4.9, 114.9], bo: [-16.5, -68.1], br: [-15.8, -47.9],
  bs: [25.1, -77.3], bw: [-24.7, 25.9], by: [53.9, 27.6], bz: [17.3, -88.8], ca: [45.4, -75.7],
  cd: [-4.3, 15.3], cf: [4.4, 18.6], cg: [-4.3, 15.3], ch: [46.9, 7.4], ci: [6.8, -5.3],
  cl: [-33.4, -70.7], cm: [3.9, 11.5], cn: [39.9, 116.4], co: [4.7, -74.1], cr: [9.9, -84.1],
  cu: [23.1, -82.4], cy: [35.2, 33.4], cz: [50.1, 14.4], de: [52.5, 13.4], dk: [55.7, 12.6],
  do: [18.5, -69.9], dz: [36.8, 3.1], ec: [-0.2, -78.5], ee: [59.4, 24.8], eg: [30.0, 31.2],
  es: [40.4, -3.7], et: [9.0, 38.7], fi: [60.2, 24.9], fj: [-18.1, 178.4], fr: [48.9, 2.4],
  ga: [0.4, 9.5], gb: [51.5, -0.1], ge: [41.7, 44.8], gh: [5.6, -0.2], gr: [38.0, 23.7],
  gt: [14.6, -90.5], hk: [22.3, 114.2], hn: [14.1, -87.2], hr: [45.8, 16.0], ht: [18.5, -72.3],
  hu: [47.5, 19.0], id: [-6.2, 106.8], ie: [53.3, -6.3], il: [31.8, 35.2], in: [28.6, 77.2],
  iq: [33.3, 44.4], ir: [35.7, 51.4], is: [64.1, -21.9], it: [41.9, 12.5], jm: [18.0, -76.8],
  jo: [31.9, 35.9], jp: [35.7, 139.7], ke: [-1.3, 36.8], kg: [42.9, 74.6], kh: [11.6, 104.9],
  kr: [37.6, 127.0], kw: [29.4, 48.0], kz: [51.2, 71.4], la: [18.0, 102.6], lb: [33.9, 35.5],
  lk: [6.9, 79.9], lt: [54.7, 25.3], lu: [49.6, 6.1], lv: [56.9, 24.1], ly: [32.9, 13.2],
  ma: [34.0, -6.8], mc: [43.7, 7.4], md: [47.0, 28.9], me: [42.4, 19.3], mg: [-18.9, 47.5],
  mk: [42.0, 21.4], mm: [19.8, 96.1], mn: [47.9, 106.9], mo: [22.2, 113.5], mt: [35.9, 14.5],
  mu: [-20.2, 57.5], mv: [4.2, 73.5], mx: [19.4, -99.1], my: [3.1, 101.7], mz: [-25.9, 32.6],
  na: [-22.6, 17.1], ng: [9.1, 7.5], ni: [12.1, -86.3], nl: [52.4, 4.9], no: [59.9, 10.8],
  np: [27.7, 85.3], nz: [-41.3, 174.8], om: [23.6, 58.5], pa: [9.0, -79.5], pe: [-12.0, -77.0],
  pg: [-9.5, 147.2], ph: [14.6, 121.0], pk: [33.7, 73.1], pl: [52.2, 21.0], pr: [18.5, -66.1],
  pt: [38.7, -9.1], py: [-25.3, -57.6], qa: [25.3, 51.5], ro: [44.4, 26.1], rs: [44.8, 20.5],
  ru: [55.8, 37.6], rw: [-1.9, 30.1], sa: [24.7, 46.7], sd: [15.5, 32.5], se: [59.3, 18.1],
  sg: [1.4, 103.8], si: [46.1, 14.5], sk: [48.1, 17.1], sn: [14.7, -17.4], sv: [13.7, -89.2],
  sy: [33.5, 36.3], th: [13.8, 100.5], tn: [36.8, 10.2], tr: [39.9, 32.9], tt: [10.7, -61.5],
  tw: [25.0, 121.6], tz: [-6.2, 35.7], ua: [50.5, 30.5], ug: [0.3, 32.6], us: [38.9, -77.0],
  uy: [-34.9, -56.2], uz: [41.3, 69.2], ve: [10.5, -66.9], vn: [21.0, 105.8], za: [-25.7, 28.2],
  zm: [-15.4, 28.3], zw: [-17.8, 31.1],
}

function zoneNow() {
  try {
    return globalThis.Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone ?? ''
  } catch {
    return ''
  }
}

/**
 * Where home is, as a point, in the shape spotTrip wants.
 *
 * @param stated  the country somebody chose, from readHome()
 * @param zone    the phone's timezone, for sharpening when it agrees
 * @returns { lat, lng, known, from } — `from` is 'zone' or 'capital', for
 *          nothing but reading the logs when this gets something wrong
 */
export function homeIs(stated, zone = zoneNow()) {
  const iso = String(stated || '').toLowerCase()
  if (!/^[a-z]{2}$/.test(iso)) return { lat: null, lng: null, known: false, from: null }

  // The phone is in the country they named, so it knows their city and the
  // capital would be a downgrade. `null` for the locale on purpose: a locale
  // says where a phone was bought, which is no evidence at all about where
  // it is standing right now.
  if (guessHome(zone, null) === iso) {
    const at = zonePoint(zone)
    if (at) return { ...at, known: true, from: 'zone' }
  }

  const cap = CAPITALS[iso]
  if (cap) return { lat: cap[0], lng: cap[1], known: true, from: 'capital' }
  return { lat: null, lng: null, known: false, from: null }
}
