// Did that write actually happen?
//
// PostgREST does not fail a write that row-level security refuses. It runs
// the statement, no rows match the policy, and it answers 204 with no error
// — indistinguishable from a successful write of nothing. So this:
//
//   const { error } = await supabase.from('photos').delete().eq('id', id)
//   if (error) return complain()
//   setPhotos((rows) => rows.filter((r) => r.id !== id))
//
// takes the photograph off the screen, tells nobody anything, and puts it
// back on the next load. Which is exactly what happened on the example trip:
// deleting a picture appeared to work every time and changed nothing.
//
// The fix is to ask for the rows back — `.delete().eq(...).select()` — and
// treat an empty answer as the refusal it is.

/**
 * @param result  a supabase response from a write that ended in .select()
 * @param what    what was being changed, for the sentence somebody reads
 * @returns { ok, why } — `why` is null when ok
 */
export function applied(result = {}, what = 'that') {
  if (result.error) return { ok: false, why: result.error.message }
  const rows = result.data
  const n = Array.isArray(rows) ? rows.length : rows ? 1 : 0
  if (n > 0) return { ok: true, why: null }
  return {
    ok: false,
    // Said the way it is actually true: the write was refused, and the
    // reason is almost always that this trip is not yours to change.
    why: `Couldn't change ${what} — this trip isn't yours to edit.`,
  }
}
