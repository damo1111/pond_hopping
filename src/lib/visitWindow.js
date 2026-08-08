// When to be recording, decided from the trips rather than from a switch.
//
// The old shape was a start button and a stop button, which asks the wrong
// thing of a person: nobody wants to run a recorder, they want the trip to
// fill itself in. And a switch you have to remember fails in the worst
// direction — you forget to start it on the day you leave, and you forget
// to stop it for the eleven months afterwards.
//
// So consent is given once and the dates do the rest. You are recorded
// while you are on a trip, and not otherwise. A trip with no end date is
// one you are still on, but only for as long as that is plausible: a draft
// from 2019 with an open end is not a reason to follow somebody around
// forever.

const DAY = 86400000

/** Trips are planned optimistically; a day either side covers travel days. */
export const EDGE_DAYS = 1

/**
 * How long an open-ended trip stays open before it is treated as abandoned
 * rather than ongoing. Long enough for a genuinely long trip to keep
 * recording, short enough that a forgotten draft stops.
 */
export const OPEN_ENDED_DAYS = 120

const day = (ms) => new Date(ms).toISOString().slice(0, 10)
const parse = (iso) => (iso ? Date.parse(`${iso}T00:00:00Z`) : NaN)

/**
 * The trips that cover today.
 *
 * @param {Array<{title?: string, start_date?: string, end_date?: string, status?: string}>} trips
 * @param {number} now
 */
export function activeTrips(trips, now = Date.now()) {
  const today = parse(day(now))
  return (trips ?? []).filter((t) => {
    if (t?.status === 'draft') return false
    const from = parse(t?.start_date)
    if (!Number.isFinite(from)) return false
    const to = Number.isFinite(parse(t?.end_date))
      ? parse(t.end_date)
      : from + OPEN_ENDED_DAYS * DAY
    return today >= from - EDGE_DAYS * DAY && today <= to + EDGE_DAYS * DAY
  })
}

/**
 * Should the recorder be running right now?
 *
 * Consent is the gate; the dates are the schedule. Both have to agree, and
 * neither is inferred from the other — somebody who has said yes is not
 * agreeing to be recorded in perpetuity, and somebody on a trip who has
 * never been asked is not consenting by being on it.
 *
 * @param {{ consented?: boolean, trips?: Array<object>, now?: number }} state
 */
export function shouldRecord({ consented, trips, now = Date.now() } = {}) {
  if (!consented) return false
  return activeTrips(trips, now).length > 0
}

/**
 * The state to move to, or null when nothing needs doing.
 *
 * Returned rather than performed so the decision is testable without a
 * phone, and so the caller can be a one-line effect.
 */
export function nextAction({ consented, enabled, trips, now = Date.now() } = {}) {
  const want = shouldRecord({ consented, trips, now })
  if (want === !!enabled) return null
  return want ? 'start' : 'stop'
}

/**
 * What the Account card says. It has to explain why it is off, because "off
 * while you are not travelling" and "off because you said no" look identical
 * on a switch and mean completely different things.
 */
export function recordingStatus({ consented, trips, now = Date.now() } = {}) {
  if (!consented) return { on: false, note: 'Off. Places are only noted if you ask for it.' }
  const active = activeTrips(trips, now)
  if (!active.length) {
    return {
      on: false,
      note: 'On, but nothing to record — it wakes up when a trip starts and sleeps again after.',
    }
  }
  const names = active.map((t) => t.title).filter(Boolean)
  return {
    on: true,
    note: names.length
      ? `Recording — you're on ${names.slice(0, 2).join(' and ')}.`
      : 'Recording, because a trip is on today.',
  }
}
