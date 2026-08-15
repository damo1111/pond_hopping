// Picking many things and doing one thing to them.
//
// Removing photographs was one at a time, through a lightbox, behind a
// confirm() — fine for the one that came out blurred, useless for the eight
// hundred that arrived twice. There was no way to say "these" rather than
// "this", so the only route to a clean trip was eight hundred confirmations
// or somebody running SQL.
//
// The shape everybody already knows is Google Photos': a circle at the
// corner of each tile, a long press to begin, a count and one action at the
// bottom. This is that, minus the drawing.
//
// Pure, because the parts that go wrong are not visual. Which ids are
// selected after a range of taps, what "select all" means when the grid is
// filtered, and how a delete of nine hundred rows is cut into requests that
// will actually complete — none of that needs a browser to get right, and
// all of it is wrong in the obvious first implementation.

/** Toggle one, returning a new Set rather than mutating the old. */
export function toggle(chosen, id) {
  const next = new Set(chosen ?? [])
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * Select-all over what is on screen, not over everything that exists.
 *
 * The Photos tab filters — by day, by highlights — and "all" while a filter
 * is on has to mean the filtered set. Selecting nine hundred rows because
 * somebody pressed All while looking at twelve is the kind of help nobody
 * asked for, and it is irreversible.
 */
export function allOf(visible = []) {
  return new Set(visible.map((p) => p?.id).filter(Boolean))
}

/** True when every visible thing is already chosen — so the one control can
 *  be All or None without a second button. */
export function everyOneChosen(chosen, visible = []) {
  if (!visible.length) return false
  const have = chosen ?? new Set()
  return visible.every((p) => have.has(p?.id))
}

/**
 * What survives a filter changing under a selection.
 *
 * Somebody selects forty on Tuesday's photographs, then switches to
 * Wednesday. The forty are no longer on screen. Keeping them selected means
 * a delete removes things the person can no longer see — so the selection is
 * narrowed to what is actually in front of them.
 */
export function stillVisible(chosen, visible = []) {
  const on = new Set(visible.map((p) => p?.id))
  return new Set([...(chosen ?? [])].filter((id) => on.has(id)))
}

/** The most ids to put in one request. PostgREST builds `in.(…)` into the
 *  URL, and a thousand uuids is roughly forty kilobytes of query string —
 *  past what proxies will carry, and it fails as a malformed request rather
 *  than as anything that mentions length. */
export const PER_REQUEST = 100

/** Cut a selection into requests that will actually arrive. */
export function inChunks(ids, size = PER_REQUEST) {
  const all = [...(ids ?? [])]
  const out = []
  for (let i = 0; i < all.length; i += Math.max(1, size)) out.push(all.slice(i, i + Math.max(1, size)))
  return out
}

/** "Remove 12 photographs" — said with the number, because the number is the
 *  whole reason to hesitate. */
export function askingToRemove(n) {
  if (n === 1) return 'Remove this photograph from the trip?'
  return `Remove ${n.toLocaleString('en-GB')} photographs from the trip?`
}

/**
 * What actually happened, out of the per-chunk results.
 *
 * Counted from the rows that came back rather than from what was asked for.
 * A delete that RLS declines returns no error and no rows — so trusting the
 * request would report nine hundred removed and put them all back on the
 * next load, which is precisely the bug the single-photo path was written to
 * avoid and would have been reintroduced here at scale.
 */
export function whatWentThrough(results = []) {
  let removed = 0
  const refused = []
  for (const r of results) {
    if (r?.error) refused.push(r.error.message ?? String(r.error))
    else removed += (r?.data ?? []).length
  }
  return { removed, refused }
}
