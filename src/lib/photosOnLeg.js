// The photographs taken on the flight itself.
//
// A tracker knows a flight happened. This app also holds every photograph
// with the instant it was taken, so the ones between wheels-up and
// wheels-down are, unambiguously, from that leg: the meal, the wing, the
// sunrise somewhere over the Gobi. Nobody else can show them beside the
// flight, because nobody else has both halves.
//
// Actual times where the enrichment found them, scheduled where it did not —
// a flight that pushed back forty minutes late took its photographs forty
// minutes late too, and the scheduled window would miss them.

/** A little either side, because the phone comes out before the doors close.
 *  Twenty minutes is boarding and the taxi, not the terminal. */
const EDGE_MIN = 20

export function legWindow(flight = {}, edgeMinutes = EDGE_MIN) {
  const from = Date.parse(flight.actual_dep_time || flight.dep_time || '')
  const to = Date.parse(flight.actual_arr_time || flight.arr_time || '')
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return null
  const edge = edgeMinutes * 60000
  return { from: from - edge, to: to + edge }
}

/**
 * @param photos  Rows with `taken_at`. Anything without one is not placed in
 *                time and cannot be claimed by a leg — a photograph with no
 *                clock on it belongs to the trip, not to this flight.
 */
export function photosOnLeg(photos = [], flight = {}, edgeMinutes = EDGE_MIN) {
  const win = legWindow(flight, edgeMinutes)
  if (!win) return []
  return photos
    .filter((p) => {
      if (!p?.taken_at) return false
      const t = Date.parse(p.taken_at)
      return !Number.isNaN(t) && t >= win.from && t <= win.to
    })
    .sort((a, b) => Date.parse(a.taken_at) - Date.parse(b.taken_at))
}
