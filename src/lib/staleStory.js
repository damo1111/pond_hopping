// A reconstructed day is derived data, and derived data goes stale.
//
// "Piece together" was built as a one-shot: press it, get days, done. That
// is the wrong shape for what it is. Add forty photographs to a day and
// the stops change — a stop splits in two, a passing snap becomes an hour
// somewhere, a place that was ambiguous now has enough pictures to settle.
// The story on file is then a description of a set of photographs that no
// longer exists, and nothing said so.
//
// What makes sweeping it up cheap is the coordinate cache. Re-clustering
// and re-telling are arithmetic; only genuinely new coordinates cost a
// lookup, and only newly-ambiguous stops cost a look at a picture. So a
// re-spin after adding photographs to a day you already have is usually
// free, and never more expensive than the new part.
//
// The one hard rule: a day somebody has edited by hand is theirs. No sweep
// touches it, ever. A feature that can silently overwrite what somebody
// wrote about their own holiday is worse than no feature.

/** What a day was built from, recorded on the entry so it can be compared
 *  with what is there now. Deliberately small — a count and a high-water
 *  mark, not a list of ids that would grow with the trip. */
export function builtFrom(day) {
  const photos = day?.photos ?? []
  return {
    photos: photos.length,
    // `day.stops` stopped existing when a day became segments, and the `??`
    // meant this recorded 0 instead of throwing. Entries written before the
    // rename carry a real count — 7, 12, 13 on Rome — so 7 !== 0 made every
    // one of them permanently stale. The auto-sweep then re-wrote them on
    // every page load, for ever, paying for a model call each time, and on
    // one of those loads it replaced four hand-written entries with
    // "Out from 14:37 to 21:45. Nothing along the way is on the map."
    stops: (day?.segments ?? []).length,
    // The newest photograph the story knew about. Catches the ordinary
    // case — more pictures added later — without needing to diff ids.
    latest: photos.reduce((max, p) => (p?.taken_at > max ? p.taken_at : max), ''),
  }
}

/**
 * Has this day changed since its story was written?
 *
 * @param entry  the journal entry, carrying built_from
 * @param day    the day as it is now
 */
export function isStale(entry, day) {
  // Not ours: written by a person, from nothing we recorded. Leave it.
  if (!entry?.built_from) return false
  // Edited by hand since. Theirs now.
  if (entry.edited_at) return false

  const was = entry.built_from
  const now = builtFrom(day)
  return was.photos !== now.photos || was.stops !== now.stops || (was.latest ?? '') !== now.latest
}

/**
 * Which days need re-telling, and which must be left alone.
 *
 * @param days     from daysFrom()
 * @param entries  the trip's journal entries
 */
export function sweep(days = [], entries = []) {
  const byDate = new Map(entries.map((e) => [e.entry_date, e]))
  const fresh = []   // no entry at all — never written up
  const stale = []   // ours, unedited, and the photographs have moved on
  const leave = []   // theirs, or ours and still accurate

  for (const day of days) {
    const entry = byDate.get(day.date)
    if (!entry) fresh.push(day)
    else if (isStale(entry, day)) stale.push(day)
    else leave.push(day)
  }

  return { fresh, stale, leave }
}
