// Running the three stages, as far as it can be done without a network.
//
// The order is fixed and the reasons are in docs/the-story.md:
//
//   1. look at every photograph          see-photos      (once, ever)
//   2. work out what happened            reconstruct-trip
//   3. ask what only they can settle     — and wait
//   4. write it                          write-trip
//
// Step 3 is the one that makes this different from pasting an EXIF file
// into a chat window. Where the record fuzzily suggests something nobody
// can verify — a late arrival on the day of a known airline outage — the
// reconstruction neither asserts it nor drops it, and the hopper's answer
// becomes evidence for the writing.

import { thumb } from './imgTransform.js'
import { TOKENS, batches, costOf } from './seeing.js'

export { batches, costOf, TOKENS }

/** The pixels each pass asks for. Low is a 512 thumbnail at 85 tokens —
 *  enough for "indoors, a restaurant, food on the table". High is 765 and
 *  can read the name off the awning. */
export const SIZES = { low: 512, high: 1024 }

/** A photograph is paid for once. Looking again only happens where the
 *  cheap pass said there was something to read, and even then only once. */
export function needsLooking(photos = [], detail = 'low') {
  return photos.filter((p) => {
    if (!p?.id || !p.url) return false
    if ((p.kind ?? 'photo') === 'receipt') return false
    if (!p.seen) return true
    // Already looked at, but only cheaply, and this is the second pass.
    return detail === 'high' && p.seen_detail === 'low'
  })
}

/** One photograph as the seeing endpoint wants it. The time and coordinates
 *  go as text because a vision model never sees EXIF — see docs. */
export function asAsked(photo = {}, detail = 'low', zone = null, clock = null) {
  const size = SIZES[detail] ?? SIZES.low
  return {
    id: photo.id,
    url: thumb(photo.url, { width: size, height: size, resize: 'contain', quality: detail === 'high' ? 80 : 60 }),
    at: clock && photo.taken_at ? clock(photo.taken_at, zone) : null,
    lat: photo.lat ?? null,
    lon: photo.lon ?? null,
  }
}

/** What a run will cost before it starts, in tokens, for the screen to say
 *  out loud. Money is not ours to quote — the price of a token changes
 *  without telling us. */
export function whatItCosts(photos = [], detail = 'low') {
  const looking = needsLooking(photos, detail).length
  const already = photos.filter((p) => p?.seen).length
  return { looking, already, ...costOf(looking, detail) }
}

/** Questions the hopper has not answered yet. Asked once; a no is
 *  remembered so nobody is asked the same thing twice. */
export function stillAsking(questions = []) {
  return questions.filter((q) => q?.asks && !q.answered_at)
}

/** The answers, as the writing stage reads them: only what was confirmed.
 *  A no is not evidence of the opposite, it is the absence of evidence, and
 *  sending it back would invite the model to argue with it. */
export function confirmed(questions = []) {
  return questions
    .filter((q) => q?.answer === 'yes')
    .map((q) => ({ on_date: q.on_date ?? null, is: q.asks }))
}

/** Days the hopper wrote themselves, keyed by date, for the writing stage
 *  to keep verbatim. Reconstructions are excluded: this system imitating
 *  itself is how a voice becomes a parody of one. */
export function theirWords(entries = []) {
  const out = {}
  for (const e of entries) if (e?.note && !e.built_from) out[e.entry_date] = e.note
  return out
}

/** The story as rows for the table, from what came back. */
export function storyRow(trip = {}, written = {}, reconstruction = null, { voice = 'narrator' } = {}) {
  return {
    trip_id: trip.id ?? null,
    opening: written.opening ?? null,
    chapters: (written.days ?? []).map((d) => ({
      date: d.date,
      title: d.title ?? null,
      note: d.note ?? '',
    })),
    closing: written.closing ?? null,
    reconstruction,
    voice,
    updated_at: new Date().toISOString(),
  }
}

/** How far through a run we are, as something a person can read. */
export const STEPS = ['looking', 'working it out', 'asking', 'writing']

export function howFar(step, done = 0, total = 0) {
  if (step === 'looking' && total) return `Looking at ${done} of ${total} photographs`
  if (step === 'working it out') return 'Working out what happened'
  if (step === 'asking') return 'A few things only you can settle'
  if (step === 'writing') return 'Writing it'
  return ''
}
