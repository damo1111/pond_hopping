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
    .filter((q) => q?.said?.trim() || q?.answer === 'yes')
    .map((q) => ({
      on_date: q.on_date ?? null,
      asked: q.asks,
      // What they typed, where they typed something. A sentence from the
      // person who was there outranks everything else in the pipeline.
      said: q.said?.trim() || null,
    }))
}

/** What they were asked and could not answer. Worth sending too: it is the
 *  difference between a gap the writing admits and a gap it fills. */
export function couldNotSay(questions = []) {
  return questions
    .filter((q) => q?.answer === 'unsure' && !q?.said?.trim())
    .map((q) => ({ on_date: q.on_date ?? null, asked: q.asks }))
}

/** Outstanding questions, as the reconstruction reads them, so it can avoid
 *  asking them again in different words. */
export function stillOpen(questions = []) {
  return stillAsking(questions).map((q) => ({ on_date: q.on_date ?? null, asked: q.asks }))
}

/** Words that carry no information about which question this is. Comparing
 *  raw strings catches nothing: "What was the flight over Scotland before
 *  you reached Heathrow?" and "What journey brought you over Scotland and
 *  into Heathrow?" share almost no exact wording and are one question. */
const NOISE = new Set([
  'a', 'about', 'an', 'and', 'any', 'anything', 'are', 'around', 'as', 'at', 'be', 'been',
  'before', 'between', 'brought', 'but', 'by', 'can', 'did', 'do', 'doing', 'during', 'else',
  'filled', 'for', 'from', 'had', 'happened', 'has', 'have', 'in', 'into', 'is', 'it', 'its',
  'near', 'of', 'on', 'or', 'over', 'remember', 'that', 'the', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'to', 'took', 'up', 'was', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'why', 'with', 'you', 'your',
])

/** Enough of a stem to see that "flight" and "flights" are one word, and
 *  "connecting" and "connect". Not a real stemmer and not trying to be —
 *  "begun" and "begin" stay two words, which is a limit rather than a bug. */
function stem(w) {
  for (const end of ['ings', 'ing', 'ies', 'es', 'ed', 's']) {
    if (w.endsWith(end) && w.length - end.length >= 4) return w.slice(0, -end.length)
  }
  return w
}

function meat(text) {
  return new Set(
    String(text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !NOISE.has(w))
      .map(stem)
  )
}

/** How much two questions are the same question, 0 to 1.
 *
 *  Set from the real thing rather than by feel. Across the fifteen open
 *  questions four runs left on the Rome trip, every pair a person would call
 *  the same question scores between 0.33 and 0.57, and every pair that is
 *  genuinely two questions scores 0.17 or less. There is a clean gap with
 *  nothing in it, so the line goes in the middle of the gap.
 *
 *  0.5 was the first guess and it sat above four of those duplicates: "What
 *  happened on the final day of the trip?" and "How did the Rome trip end on
 *  25 January?" share only the word "trip", and scored 0.33. */
export const SAME_ENOUGH = 0.3

export function likeness(a, b) {
  const x = meat(a)
  const y = meat(b)
  if (!x.size || !y.size) return 0
  let shared = 0
  for (const w of x) if (y.has(w)) shared++
  // Against the shorter one: a terse question and a wordy one asking the
  // same thing should still count as the same thing.
  return shared / Math.min(x.size, y.size)
}

/**
 * What is actually worth putting in front of somebody: the open questions,
 * with the repeats folded away.
 *
 * The guard above stops new duplicates being filed. It cannot help with the
 * ones already on the table — four runs over one trip in Rome left twenty-one
 * open questions, several of them the same question three times over, and
 * showing all of those is worse than showing none. The oldest wording of each
 * is the one kept: it is the one that has been sitting there longest.
 */
export function worthAsking(questions = []) {
  const open = stillAsking(questions)
  const keep = []
  for (const q of open) if (!alreadyAsked(keep, q)) keep.push(q)
  return keep
}

/**
 * Has this already been put to them?
 *
 * Same day, and enough of the same content words. The date matters — "what
 * happened here?" about Monday and about Thursday are two questions — but a
 * question with no date is compared against everything, because an undated
 * repeat of a dated question is still a repeat.
 */
export function alreadyAsked(questions = [], candidate = {}) {
  const on = candidate.on_date || null
  return questions.some((q) => {
    if (!q?.asks) return false
    const theirs = q.on_date || null
    if (on && theirs && on !== theirs) return false
    return likeness(q.asks, candidate.asks) >= SAME_ENOUGH
  })
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

/** What is happening, said the way somebody would say it.
 *
 *  "Working out what happened" was the first attempt and it means nothing —
 *  it is the name of a stage in a pipeline, not a description of anything a
 *  person can picture. Each of these names the actual work. */
export function howFar(step, done = 0, total = 0) {
  if (step === 'looking' && total) return `Reading your photographs — ${done} of ${total}`
  if (step === 'working it out') return 'Retracing where you went'
  if (step === 'asking') return 'A few things only you can answer'
  if (step === 'writing') return 'Writing your trip up'
  return ''
}

/**
 * Which days a story does not yet know about.
 *
 * A photograph added after the story was written belongs to a day, and that
 * day is the only part of the writing that can possibly have changed. The
 * rest of the trip happened exactly as it did before somebody uploaded a
 * picture of a menu.
 */
export function daysAdded(photos = [], story = null) {
  const written = story?.updated_at
  if (!written) return []
  const days = new Set()
  for (const p of photos) {
    if (!p?.created_at || !(p.created_at > written)) continue
    const d = p.taken_on || String(p.taken_at ?? '').slice(0, 10)
    if (d) days.add(d)
  }
  return [...days].sort()
}

/**
 * The new chapters, in the old story, with everything else untouched.
 *
 * Rewriting a whole trip because one day changed is expensive and — worse —
 * not deterministic: chapters somebody has already read and liked come back
 * different, unasked. Only the days that were rewritten are replaced; a day
 * that came back empty keeps what it had rather than losing it.
 */
export function spliceChapters(existing = [], written = []) {
  const fresh = new Map()
  for (const d of written) if (d?.date && d?.note) fresh.set(d.date, d)

  const out = existing.map((c) => (fresh.has(c.date) ? { ...c, ...fresh.get(c.date) } : c))
  // A day that did not exist in the story at all — the first photograph of
  // a day nobody had recorded — is an addition rather than a replacement.
  const known = new Set(existing.map((c) => c.date))
  for (const [date, d] of fresh) if (!known.has(date)) out.push({ date, title: d.title ?? null, note: d.note })
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

/** The parts of a reconstruction that are about the trip rather than a day. */
const ACROSS = ['patterns', 'returned_to', 'attention']

const settled = (v) =>
  JSON.stringify((Array.isArray(v) ? v : []).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).sort())

/**
 * Did the new photographs change something the whole trip depends on?
 *
 * Scoping a rebuild to the day a photograph belongs to is right almost
 * always, and wrong in one specific way: the writer is told to weave the
 * trip's threads through the days, at the point a reader would notice them.
 * "The second time I crossed Piazza Navona" is a sentence in Tuesday's
 * chapter that a photograph uploaded about Thursday can make false.
 *
 * So the cross-trip findings are compared before and after. If they are the
 * same — which is the usual case, because one more picture of a fountain
 * rarely changes what the trip was about — only the days that moved get
 * rewritten. If they have changed, the chapters that lean on them are stale,
 * and the honest thing is to write the trip again.
 */
export function widerThanADay(before = null, after = null) {
  if (!before || !after) return true
  return ACROSS.some((key) => settled(before[key]) !== settled(after[key]))
}
