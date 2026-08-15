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
