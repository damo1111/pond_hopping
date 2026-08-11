import { enrichment, worthAsking } from './flightEnrich.js'

// Asking about a lot of flights, slowly, and never twice.
//
// Four hundred and eighty-two flights, of which the source can see the ones
// from the last year. The rules for what may be written are in
// flightEnrich.js; this is only about doing it a great many times without
// being rude to an API or losing the work when a tab closes.
//
// Three things it has to get right:
//
//   pace       the free tier limits by the second, so requests go one at a
//              time with a gap. Two fired together answered one and 429'd
//              the other, which read on screen as "no data for this flight"
//   resume     `enriched_at` is the record of having asked, so re-running
//              picks up exactly where it stopped. A closed tab costs the
//              flight in flight and nothing else
//   silence    a source that answers "I have no record of that" is done
//              with, and must not be asked for ever. A source that is down
//              is not done with, and must be

/** The gap between requests. One a second is what the free tier allows. */
export const BREATH_MS = 1200

/** How many times a rate limit is waited out before giving up on a flight. */
export const PATIENCE = 3

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * What to do with one answer.
 *
 * Kept apart from the asking so the decision can be tested without a
 * network: it is the part that decides whether a flight is finished with.
 *
 * @returns 'filled' | 'nothing' | 'again' | 'beyond'
 *
 *   filled   the source knew something and it has been written down
 *   nothing  the source looked and has no record. Final, because historical
 *            flight data does not change
 *   again    the source failed rather than answered — a rate limit, a bad
 *            gateway. Stays in the queue and is tried again
 *   beyond   the date is outside what this source can see. It did not look,
 *            so there is nothing to retry and nothing to record, and the
 *            flight keeps its blank slate for whichever source comes next
 *
 * The difference between 'nothing' and 'beyond' is the one that cost
 * something. 185 flights were marked "no record" by a source that had
 * refused to open its eyes — permanently, since that mark is exactly what
 * stops a flight being asked about twice. The next provider would have
 * skipped every one of them, and the only symptom would have been a
 * backfill that finished suspiciously quickly.
 */
export function verdictOf(answer = {}, ok = true) {
  if (!ok) return 'again'
  // A rate limit is the source declining to answer, not an answer.
  if (answer.status === 429 || answer.status === 503) return 'again'
  // Nor is "that date is older than I am allowed to look at".
  if (answer.beyond) return 'beyond'
  if (answer.found === false) return 'nothing'
  if (answer.fields && Object.keys(answer.fields).length) return 'filled'
  return 'nothing'
}

/**
 * Fill in every flight a source can see.
 *
 * @param flights   rows to consider; only the ones worth asking are asked
 * @param ask       (flight) => ({ ok, answer }) — one lookup
 * @param save      (id, patch) => Promise — one write
 * @param onStep    called after each flight with what happened so far
 * @param now       for tests
 */
export async function backfill(
  flights = [],
  { ask, save, onStep = null, now = new Date(), breath = BREATH_MS, wait = sleep, reach = null } = {}
) {
  const queue = worthAsking(flights, { now, reach })
  const tally = { total: queue.length, done: 0, filled: 0, nothing: 0, failed: 0, beyond: 0, disagreed: 0 }
  if (!queue.length) return tally

  for (const flight of queue) {
    let verdict = 'again'
    let answer = {}

    for (let go = 0; go < PATIENCE; go++) {
      if (go > 0) await wait(breath * (go + 1))
      const got = await ask(flight).catch(() => ({ ok: false, answer: {} }))
      answer = got?.answer ?? {}
      verdict = verdictOf(answer, got?.ok !== false)
      if (verdict !== 'again') break
    }

    if (verdict === 'again') {
      tally.failed++
    } else if (verdict === 'beyond') {
      // Nothing written down at all. The source never looked, so this flight
      // is exactly as unasked as it was a second ago — which is the point:
      // the next source gets to try it.
      tally.beyond++
    } else {
      const { patch, disagreed } = enrichment(flight, answer.fields ?? {}, 'aerodatabox')
      if (verdict === 'nothing' && !Object.keys(patch).length) {
        // Answered, and has nothing. Stamped so it is never asked again —
        // this is the difference between a source with no record and a
        // source that was down, and only one of them is finished with.
        await save(flight.id, {
          enriched_at: new Date().toISOString(),
          enriched_from: 'aerodatabox:none',
        })
        tally.nothing++
      } else {
        await save(flight.id, patch)
        tally.filled++
        tally.disagreed += disagreed.length
      }
    }

    tally.done++
    onStep?.({ ...tally }, flight)
    await wait(breath)
  }

  return tally
}
