// Which paragraph a trip gets described by.
//
// There were two summaries of a trip and they did not know about each other.
// `trip_summaries` holds a cached paragraph written by the summarize-trip
// Edge Function from the journal entries — everything somebody typed into a
// text box, and nothing else. `trip_stories.closing` is the last section of
// the written story: the trip looked back on, built from every photograph,
// the flights, the runs, the answers to the questions and the entries.
//
// The second is better by a distance, and it is already written and already
// paid for. So where a story exists it is the summary, everywhere a summary
// appears — which also means that rewriting the story rewrites the summary,
// with nothing to invalidate and no second call to make.
//
// The cached one stays for trips with no story: a trip with three journal
// entries and no photographs still deserves a paragraph.

/** How much of the closing a card shows before it wants to be tapped. */
export const CARD_CHARS = 400

/**
 * The trip in a paragraph.
 *
 * @param story   the trip_stories row, or null
 * @param cached  the trip_summaries row, or null
 * @returns { text, from } — `from` is 'story' or 'cached' or null
 */
export function summaryOf(story = null, cached = null) {
  const told = String(story?.closing ?? '').trim()
  if (told) return { text: told, from: 'story' }
  const was = String(cached?.summary ?? '').trim()
  if (was) return { text: was, from: 'cached' }
  return { text: null, from: null }
}

/**
 * Should the cached paragraph be rewritten because the journal moved on?
 *
 * Never, once a story is telling it. The story is rewritten by its own run,
 * and regenerating the weaker paragraph over the top of the better one
 * because somebody fixed a typo is how the good text gets lost.
 */
export function needsRewrite({ story = null, cached = null, newestEntry = null, hasEntries = false } = {}) {
  if (!hasEntries) return false
  if (String(story?.closing ?? '').trim()) return false
  if (!cached) return true
  return !!(newestEntry && cached.generated_at && newestEntry > cached.generated_at)
}
