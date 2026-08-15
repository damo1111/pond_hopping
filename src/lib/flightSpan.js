// A flight is a span, not a moment.
//
// The card showed the departure time and nothing else — no arrival, no
// duration, no sense that the thing takes eleven hours. Which is the one
// fact a flight card exists to carry, and the reason Flighty's whole layout
// is two ends and a line between them.
//
// Both numbers come from what is already stored. Nothing here asks anybody
// for anything.

/** Minutes in the air, from two instants. Null when either is missing, so a
 *  flight typed in without an arrival time simply shows no duration rather
 *  than "NaNh". */
export function spanMinutes(depIso, arrIso) {
  if (!depIso || !arrIso) return null
  const a = Date.parse(depIso)
  const b = Date.parse(arrIso)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  const mins = Math.round((b - a) / 60000)
  // A negative span means the two times disagree — usually a timezone
  // written into one and not the other. Better to say nothing than to
  // print "-3h 00m" with confidence.
  return mins > 0 ? mins : null
}

/**
 * Whole days between the local departure date and the local arrival date.
 *
 * The reason a red-eye needs it: leaving Melbourne at 23:55 and landing at
 * 06:10 reads as arriving before you left unless something says +1. Takes
 * the two dates already computed for display rather than doing timezone
 * arithmetic a second time and differently.
 */
export function dayShift(depLocalDate, arrLocalDate) {
  if (!depLocalDate || !arrLocalDate) return 0
  const a = Date.parse(`${String(depLocalDate).slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${String(arrLocalDate).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86400000)
}

/** Duration as somebody says it out loud. */
export function saidAs(minutes) {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`
}

/**
 * How the flight actually went, against how it was meant to go.
 *
 * `actual_dep_time` and `actual_arr_time` have been stored by the enrichment
 * for months and shown nowhere. "Landed twelve minutes early" is the single
 * line people open a flight tracker for, and this app had every number
 * needed to say it and said none of them.
 *
 * Arrival first, because once a flight has landed nobody cares what the
 * departure did. Returns null when there is nothing honest to say — an
 * unflown flight, or one nobody enriched.
 */
export function howItWent(flight = {}) {
  const arr = drift(flight.arr_time, flight.actual_arr_time)
  if (arr) return { ...arr, when: 'Landed' }
  const dep = drift(flight.dep_time, flight.actual_dep_time)
  if (dep) return { ...dep, when: 'Departed' }
  return null
}

/** Minutes between what was planned and what happened, and what to call it.
 *
 *  Three minutes is not a story. Airlines pad schedules and a card that
 *  announces "two minutes late" on every leg trains somebody to stop reading
 *  the line that matters when it is twenty. */
export function drift(planned, actual, slack = 5) {
  if (!planned || !actual) return null
  const a = Date.parse(planned)
  const b = Date.parse(actual)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  const mins = Math.round((b - a) / 60000)
  if (Math.abs(mins) <= slack) return { minutes: 0, word: 'on time', late: false }
  return mins > 0
    ? { minutes: mins, word: 'late', late: true }
    : { minutes: -mins, word: 'early', late: false }
}
