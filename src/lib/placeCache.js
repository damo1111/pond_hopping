import { supabase } from './supabase.js'
import { cacheKey, round4 } from './coordKey.js'

// What is at a coordinate does not change between Tuesday and Thursday.
//
// Piecing a trip together asks a maps API what is at each stop. Without
// this, running it twice costs twice — and it will be run twice, because
// the distance thresholds are exactly the kind of thing that gets tuned
// after seeing real output on a real trip. Thirteen trips re-run three
// times is a quota bill for a question already answered.
//
// Kept per person rather than shared: the rows are public map data, but
// the existence of a row says somebody stopped there, and one account's
// holidays are not another account's business.

export { cacheKey, round4 }

/**
 * @param stops [{ key, lat, lon }]
 * @returns { hits, misses } — hits keyed by the caller's own stop key
 */
export async function readCache(stops = [], userId) {
  const hits = {}
  if (!userId || !stops.length) return { hits, misses: stops }

  // One query for the lot. Asking per stop would trade an API round trip
  // for a database round trip, which is not the saving.
  const { data, error } = await supabase
    .from('place_lookups')
    .select('lat4,lon4,candidates')
    .eq('owner_id', userId)
    .in('lat4', [...new Set(stops.map((s) => round4(s.lat)))])

  if (error || !data) return { hits, misses: stops }

  const known = new Map(data.map((r) => [`${Number(r.lat4)},${Number(r.lon4)}`, r.candidates]))
  const misses = []
  for (const stop of stops) {
    const found = known.get(cacheKey(stop.lat, stop.lon))
    if (found) hits[stop.key] = found
    else misses.push(stop)
  }
  return { hits, misses }
}

/** Best effort: a cache that fails to save is slower, not broken. */
export async function writeCache(stops = [], answers = {}, userId) {
  if (!userId) return
  const rows = stops
    .filter((s) => answers[s.key])
    .map((s) => ({
      owner_id: userId,
      lat4: round4(s.lat),
      lon4: round4(s.lon),
      candidates: answers[s.key],
    }))
  if (!rows.length) return
  await supabase.from('place_lookups').upsert(rows, { onConflict: 'owner_id,lat4,lon4' })
}
