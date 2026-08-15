// A tester's session, read back as one column of time.
//
// Three tables have been collecting this for weeks — app_events, app_errors,
// and now bug_reports — and reading them was three separate queries whose
// results you had to interleave in your head by timestamp. Which is why a
// bug report took twenty minutes: not because the data was missing, but
// because nothing put it in order.
//
// what_happened() does the union in the database. This does the part that
// has to be right for a person rather than for a query planner: what each
// row is called, where the gaps are, and which lines are worth stopping on.
//
// Pure. The whole point is that "does this session read correctly" can be
// answered without a database, a phone or a tester.

/** Anything longer than this is somebody having put the phone down. */
export const A_GAP = 60000

/**
 * Names for the events, because `photos_import_started` is a column value
 * and "Started a photo import" is a sentence.
 *
 * Deliberately a lookup with a fallback rather than a rule that prettifies
 * every name: a wrong-but-confident label is worse than the raw string,
 * and the raw string is already readable. Anything not named here comes
 * through as it was written, which is also how a new event announces that
 * nobody has taught this list about it yet.
 */
const NAMES = {
  app_open: 'Opened the app',
  trip_select: 'Chose a trip',
  photos_import_started: 'Started a photo import',
  photos_picker_opened: 'Opened Google’s picker',
  photos_imported: 'Photos came in',
  journey_joined_up: 'Signed in, and their earlier visits joined up',
}

export const nameOf = (event) => NAMES[event] ?? event

/**
 * One ordered story out of what_happened()'s rows.
 *
 * @param rows  [{ at, kind: 'did'|'broke'|'said', what, detail }]
 * @returns     the same rows, in order, each carrying how long since the one
 *              before it and whether that gap is worth drawing
 */
export function weave(rows = []) {
  const clean = (rows ?? [])
    .filter((r) => r && r.at)
    .map((r) => ({ ...r, ms: Date.parse(r.at) }))
    .filter((r) => !Number.isNaN(r.ms))
    .sort((a, b) => a.ms - b.ms)

  return clean.map((r, i) => {
    const since = i === 0 ? null : r.ms - clean[i - 1].ms
    return {
      at: r.at,
      kind: r.kind,
      what: r.kind === 'did' ? nameOf(r.what) : r.what,
      raw: r.what,
      detail: r.detail ?? null,
      since,
      // A pause is a fact about the session, not a formatting detail: it is
      // where somebody stopped to work out what to do, which is exactly the
      // moment a report is usually about.
      paused: since !== null && since >= A_GAP,
    }
  })
}

/** "4s", "2m 10s", "1h 04m" — gaps as somebody says them out loud. */
export function gapAs(ms) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}

/**
 * The line above the story: what this session amounts to.
 *
 * Written so it can be read before deciding whether to open the session at
 * all — an inbox of twenty reports needs a reason to open one of them
 * first, and "nine minutes, 34 steps, 2 broke" is that reason.
 */
export function inShort(story = []) {
  const did = story.filter((r) => r.kind === 'did').length
  const broke = story.filter((r) => r.kind === 'broke').length
  const said = story.filter((r) => r.kind === 'said').length
  const first = story[0]
  const last = story[story.length - 1]
  const span = first && last ? Date.parse(last.at) - Date.parse(first.at) : 0

  return {
    did,
    broke,
    said,
    span,
    // Not a count of everything: a session is long when somebody stayed, and
    // staying is time rather than taps.
    lasted: gapAs(span || 0),
    // The single most useful thing to know before opening it.
    worrying: broke > 0,
  }
}

/**
 * Where it went wrong, if it did.
 *
 * The thing somebody was doing immediately before the first break — which
 * is the question every bug report is really asking, and the one that used
 * to require scrolling two tables side by side.
 */
export function whatLedToIt(story = []) {
  const at = story.findIndex((r) => r.kind === 'broke')
  if (at < 0) return null
  const before = story.slice(Math.max(0, at - 3), at).filter((r) => r.kind === 'did')
  return { broke: story[at], before }
}
