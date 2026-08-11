// Deciding whether a trip can be written, and by whom, right now.
//
// The three stages themselves live in api/. This is the small amount of
// thinking around them that is worth having on its own — because it is the
// part that was previously scattered through a React component as `if
// (!mine.length) return null`, and that one line is why six trips could
// never be written at all.

import { alreadyAsked } from './storyRun.js'

/**
 * What evidence a trip actually has.
 *
 * Photographs were treated as the only kind for as long as this pipeline has
 * existed, which was never true and is now visibly false: six trips imported
 * from a Google Timeline have no photographs and 4,217 recorded positions,
 * 212 stays and a journal entry on nearly every day. A trip like that has
 * more to go on than a weekend with forty pictures and nothing written.
 *
 * The order below is the order of usefulness to the reconstruction, and it
 * is not the order anybody would guess. Their own entry is testimony and
 * beats everything. A stay is the strongest evidence of place there is. A
 * photograph is third — it is the only thing that says what was happening,
 * which is why it still matters, but it cannot say where somebody was in the
 * four hours they did not take one.
 */
export function whatThereIs({
  photos = [],
  tracks = [],
  visits = [],
  entries = [],
  flights = [],
  runs = [],
} = {}) {
  const said = entries.filter((e) => e?.note && !e.built_from).length
  const stays =
    tracks.reduce((n, t) => n + (t?.visits?.length ?? 0), 0) + visits.length
  return {
    photographs: photos.length,
    unread: photos.filter((p) => p?.url && !p.seen && (p.kind ?? 'photo') !== 'receipt').length,
    said,
    stays,
    days: new Set(tracks.map((t) => t?.track_date).filter(Boolean)).size,
    flights: flights.length,
    runs: runs.length,
    // Anything at all that puts somebody somewhere on a day. Without one of
    // these there is no trace to reconstruct and the honest answer is to say
    // so rather than spend a model call finding out.
    get enough() {
      return this.photographs > 0 || this.stays > 0 || this.said > 0 || this.flights > 0 || this.runs > 0
    },
  }
}

/** Long enough without a word that a run is presumed dead. Matches the
 *  default in claim_story_run(); a serverless invocation that is killed
 *  never gets to say it stopped. */
export const GONE_QUIET_MS = 15 * 60 * 1000

/**
 * Is a trip being written right now?
 *
 * A finished run is not running. Neither is one that stopped saying anything
 * a quarter of an hour ago — that is a crash, and a trip that can never be
 * written again because of one is worse than the double run this prevents.
 */
export function running(run = null, { now = new Date(), quiet = GONE_QUIET_MS } = {}) {
  if (!run?.started_at) return false
  if (run.finished_at) return false
  return now.valueOf() - Date.parse(run.started_at) < quiet
}

/**
 * Which of a reconstruction's questions are worth filing.
 *
 * The reconstruction is told what has already been put to them, and mostly
 * obeys. This is the second line: the same gap in a trace prompts the same
 * doubt on every run, and four runs over one trip in Rome left twenty-one
 * open questions with the first evening asked about three times in three
 * wordings.
 *
 * Deduplicated against what has been asked *and* against the rest of this
 * batch, because a single run can produce two versions of one question.
 */
export function newQuestions(existing = [], asks = []) {
  const keep = []
  for (const a of asks) {
    if (!a?.asks) continue
    if (alreadyAsked(existing, a)) continue
    if (alreadyAsked(keep, a)) continue
    keep.push({ on_date: a.on_date || null, asks: a.asks, because: a.because || null })
  }
  return keep
}

/**
 * How the run went, in words, for the row that records it.
 *
 * Written down because "finished" is not one thing. A trip with three
 * chapters written and eleven questions outstanding is a different outcome
 * from one that could not be written at all, and a screen reading this row
 * needs to be able to tell them apart without re-running anything.
 */
export function howItWent({ chapters = 0, asked = 0, unread = 0 } = {}) {
  const bits = [chapters === 1 ? '1 day written' : `${chapters} days written`]
  if (asked) bits.push(asked === 1 ? '1 new question' : `${asked} new questions`)
  if (unread) bits.push(`${unread} photographs still unread`)
  return bits.join(', ')
}
