// What to tell a person when one of our own endpoints says no.
//
// The reason a request failed and the sentence somebody should read are two
// different things, and they had been the same string. A hopper scanning
// their photographs for receipts was shown:
//
//   Stopped after 0 of 245: OPENAI_API_KEY is not configured
//
// which names an environment variable on a server they have never heard of,
// and reads as their fault or as the app being broken. It was neither: the
// preview deployment simply does not carry that key.
//
// The exact reason still matters — it goes to app_errors through callApi(),
// where somebody can act on it. This is only the half that goes on screen.
//
// Every sentence here has to pass one test: does it tell them whether to try
// again, and whether trying again is likely to work? "Something went wrong"
// fails it. So does the variable name.

/** Server-side faults that are configuration, not weather. */
const NOT_SWITCHED_ON = /not configured|missing (api )?key|no api key|unauthori[sz]ed .*key|invalid api key/i

/** The endpoint is up, the thing behind it is not. */
const UPSTREAM = /rate.?limit|quota|overloaded|capacity|timed? ?out|timeout|502|503|504/i

/**
 * @param status  the HTTP status, or 0 when the request never arrived
 * @param said    whatever the server put in the body, if anything
 * @returns a sentence for the person, with no server nouns in it
 */
export function plainly(status, said = '') {
  const body = String(said ?? '')

  // No status at all: the request never left, or nothing came back. The one
  // failure that is genuinely theirs to fix, and the most common on a trip.
  if (!status) return 'No connection. This will work once you have signal.'

  if (status === 401 || status === 403) return 'Signing in again should sort this.'
  if (status === 404) return 'That has moved. Worth updating the app.'
  if (status === 413) return 'That was too big to send in one go.'
  if (status === 429) return 'Too many at once. Leave it a minute and run it again.'

  // A 500 that is really "this feature is not turned on in this
  // environment" — which is every preview build, and was being read as a
  // crash. Checked before the generic 5xx so it wins.
  if (NOT_SWITCHED_ON.test(body)) return 'This one is not switched on here yet.'
  if (UPSTREAM.test(body)) return 'Busy at the other end. Running it again usually works.'

  if (status >= 500) return 'Something broke at our end, and we have been told about it.'
  if (status >= 400) return 'That was refused. Running it again may not help.'
  return 'That did not work.'
}

/**
 * The same sentence, with what had already been done in front of it.
 *
 * A run that stops halfway has kept the half it did — the person needs to
 * know that before they know why, or they will assume they have to start
 * again from nothing.
 */
export function stoppedAfter(done, total, status, said) {
  const got = done > 0 ? `Stopped after ${done} of ${total}. ` : ''
  return `${got}${plainly(status, said)}`
}
