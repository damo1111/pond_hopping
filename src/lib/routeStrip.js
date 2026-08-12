// The line of airports across the top of a trip, and which bit of it is
// which flight.
//
// The strip has always drawn the ordered stops — MEL · KUL · BKK · KBV · DMK
// · BKK · KUL · MEL — and had no connection to the cards below it. Opening a
// flight told you nothing about where you were on the journey. David, 12
// August: "for a trip like this i feel tapping the flight should show it on
// the timeline above".
//
// The hard part is that airports repeat. BKK appears twice in that trip, so
// "which dot is this flight's departure" cannot be answered by looking the
// code up — the answer depends on where in the sequence the flight sits. So
// the sequence and the legs are built together, in one pass, and each flight
// carries the two positions it occupies.

/**
 * @param flights in the order they were flown
 * @returns { stops, legs } — stops is the codes to draw; legs maps a flight
 *          id to the pair of stop positions it spans.
 *
 * A flight whose arrival is the next flight's departure shares that stop:
 * landing at Kuala Lumpur and leaving from it is one dot, not two.
 */
export function stripOf(flights = []) {
  const stops = []
  const legs = new Map()

  for (const f of flights ?? []) {
    if (!f?.dep_airport || !f?.arr_airport) continue

    // Only reuse the last stop, never an earlier one. Reusing an earlier BKK
    // would draw the second Bangkok flight as a line running backwards
    // across the whole strip.
    let from = stops.length - 1
    if (from < 0 || stops[from] !== f.dep_airport) {
      stops.push(f.dep_airport)
      from = stops.length - 1
    }

    // A flight that lands where it took off — a scenic loop — occupies one
    // stop rather than none.
    if (f.arr_airport === f.dep_airport) {
      legs.set(f.id, [from, from])
      continue
    }

    stops.push(f.arr_airport)
    legs.set(f.id, [from, stops.length - 1])
  }

  return { stops, legs }
}

/** Where along the strip a stop sits, 0 to 1. */
export function atFraction(i, count) {
  if (!(count > 1)) return 0
  return Math.min(1, Math.max(0, i / (count - 1)))
}
