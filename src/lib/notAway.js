// The places somebody has already told us are not away.
//
// spotTrip measures "away" from a country sharpened by the timezone — see
// homeIs.js — and Great Britain has one timezone, so everybody who says "the
// UK" is measured from London. Somebody living in Glasgow who photographs
// two days of Glasgow is five hundred and fifty kilometres from "home" by
// that reckoning, and gets asked whether it was a trip. It wasn't.
//
// ── Why not learn home from their photographs ─────────────────────────────
//
// That was the obvious fix and it is a bad one. It needs photographs taken
// at home, and this app's corpus is precisely the away ones: people upload
// holidays. Learning a home from that sample would produce a confident
// answer drawn from exactly the days it is meant to exclude.
//
// ── What there is instead ─────────────────────────────────────────────────
//
// The answer to the wrong question. Somebody shown "this looks like a trip"
// who taps "no, keep them loose" has just said something true and specific:
// *wherever that was, it is not away for me*. That is one tap of real signal
// about their own geography, and it was being thrown on the floor.
//
// So it is kept, and no cluster near it is ever offered again. The Glaswegian
// is asked once, says no once, and is never asked about Glasgow again —
// which is a better outcome than never asking, because the first offer is
// still right for everybody who has just come back from Canada.
//
// Device-local, like the answer to "where's home". It is a statement about
// where somebody lives, and it belongs to the phone in their hand before it
// belongs to a row on a server.

const KEY = 'pond:not-away'

/** How close to a declined place counts as the same place. */
export const SAME_PLACE_KM = 120

/** The most we keep. Somebody with more homes than this has other problems. */
export const KEEP = 12

const ok = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)

/** Everywhere this device has been told is not away. Never throws. */
export function readNotAway(store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter(ok) : []
  } catch {
    // Storage off, or something that is not JSON. Not knowing is the state
    // this started in and it is a recoverable one.
    return []
  }
}

/**
 * Remember one.
 *
 * Deduplicated by distance rather than by exact coordinate: the centre of a
 * cloud of photographs is never the same twice, and a list holding forty
 * near-identical points of the same city is a list that has stopped meaning
 * anything. Newest first, oldest dropped past KEEP — somebody who moves
 * should stop being measured against where they used to live.
 */
export function rememberNotAway(place, store = globalThis.localStorage, apart = haversine) {
  if (!ok(place)) return readNotAway(store)
  const kept = readNotAway(store).filter((p) => apart(p, place) > SAME_PLACE_KM)
  const next = [{ lat: place.lat, lon: place.lon }, ...kept].slice(0, KEEP)
  try {
    store?.setItem(KEY, JSON.stringify(next))
  } catch {
    /* the answer still stands for this session */
  }
  return next
}

/** Is this one of them? */
export function isNotAway(place, list = readNotAway(), apart = haversine) {
  if (!ok(place)) return false
  return list.some((p) => apart(p, place) <= SAME_PLACE_KM)
}

/** Forget them all. For the Settings screen, and for moving house. */
export function clearNotAway(store = globalThis.localStorage) {
  try {
    store?.removeItem(KEY)
  } catch {
    /* nothing to do about it */
  }
}

// A local copy rather than an import, so this module stays free of
// spotTrip and spotTrip can depend on it without a cycle.
const R = 6371
const rad = (d) => (d * Math.PI) / 180
function haversine(a, b) {
  if (!ok(a) || !ok(b)) return Infinity
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
