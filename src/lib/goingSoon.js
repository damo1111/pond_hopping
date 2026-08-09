// Which trip somebody is about to be on, or already is.
//
// Recording where you went is the one feature that cannot be switched on
// retrospectively. Miss the moment and the days are simply gone — there is
// no import, no backfill, no "sync from photos" that recovers a walk you
// took last Tuesday. So the app has to ask before the trip, not after, and
// it has to ask somebody who has not gone looking for the setting.
//
// Until now it only asked at the end of creating a trip. That covers the
// person who typed one in this afternoon and nobody else: not a booking that
// arrived by email, not a trip made in March for a flight in August, not
// anyone who said "not now" the first time. This is what those paths were
// missing — a reason to ask again, at the point it stops being theoretical.
//
// Pure, so the question "is she about to travel" can be tested without a
// phone, a permission dialog, or a plausible Tuesday.

/** Near enough to be packing. Far enough to still be able to say yes. */
export const SOON_DAYS = 10

/** Local calendar day as YYYY-MM-DD — compared as text, so no timezone maths. */
export function today(now = new Date()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000)

/**
 * The trip worth asking about, or null.
 *
 * Underway beats imminent — somebody already travelling has the most to lose
 * by every hour this stays off. Among the ones still to come, the soonest.
 * A trip with no start date is not a trip anybody is about to take; it is an
 * idea, and asking about it would be the same nagging that got the question
 * ignored in the first place.
 */
export function tripStartingSoon(trips = [], now = new Date()) {
  const t = today(now)

  const candidates = (trips || [])
    .filter((trip) => trip && trip.start_date && !trip.is_demo)
    .map((trip) => {
      // An open-ended trip that has started is still going. Guessing an end
      // date would either stop recording mid-holiday or never stop at all.
      const underway = trip.start_date <= t && (!trip.end_date || trip.end_date >= t)
      return { trip, underway, inDays: daysBetween(t, trip.start_date) }
    })
    .filter((c) => c.underway || (c.inDays > 0 && c.inDays <= SOON_DAYS))

  if (!candidates.length) return null

  candidates.sort((a, b) => {
    if (a.underway !== b.underway) return a.underway ? -1 : 1
    return a.inDays - b.inDays
  })
  return candidates[0]
}

/** "You're on it", "Tomorrow", "In 4 days" — said the way a person would. */
export function whenPhrase({ underway, inDays } = {}) {
  if (underway) return 'now'
  if (inDays === 0) return 'today'
  if (inDays === 1) return 'tomorrow'
  return `in ${inDays} days`
}
