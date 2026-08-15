// The example trips, put on today's clock.
//
// The flight card has six states and only two of them — landed, past — are
// reachable from stored data, because nothing feeds the other four in real
// time. See backlog §8: that is a live data source, which is a decision
// about money and polling rather than a missing function.
//
// Meanwhile the states exist and cannot be seen, which is the worst of both:
// built, unshippable, unreviewable. So the example trips borrow today's
// clock. One leg is in the air, the next is boarding, and the rest keep
// their own times.
//
// Demo trips only, and the caller has to say so. Nothing here can reach a
// real flight, which is the only property that matters: an app that quietly
// rewrote somebody's actual departure time would be worse than one that
// never demonstrated anything.

const MIN = 60000

/**
 * @param flights  In departure order, as the tab already sorts them.
 * @returns        The same flights, with the first two moved onto today.
 */
export function onTodaysClock(flights = [], now = Date.now()) {
  return flights.map((f, i) => {
    const span = spanOf(f)
    if (!span) return f
    // The first leg is mid-air, forty per cent of the way across — far
    // enough along that the line is visibly partial rather than ambiguous.
    if (i === 0) {
      const dep = now - Math.round(span * 0.4)
      return moved(f, dep, dep + span)
    }
    // The second is boarding, close enough that the minutes are the message.
    if (i === 1) {
      const dep = now + 25 * MIN
      return moved(f, dep, dep + span)
    }
    return f
  })
}

function spanOf(f) {
  const a = Date.parse(f?.dep_time || '')
  const b = Date.parse(f?.arr_time || '')
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null
  return b - a
}

/** Scheduled times moved; the actuals dropped rather than moved with them.
 *  A flight that has not landed has no arrival time yet, and inventing one
 *  would make the card say how it went while it is still going. */
function moved(f, dep, arr) {
  return {
    ...f,
    dep_time: new Date(dep).toISOString(),
    arr_time: new Date(arr).toISOString(),
    actual_dep_time: null,
    actual_arr_time: null,
  }
}
