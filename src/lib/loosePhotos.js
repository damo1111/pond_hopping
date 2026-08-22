// Photographs that belong to somebody but to no trip.
//
// They exist because the upload flow now asks — "this looks like a trip" —
// and "no, keep them loose" has to be a real answer. Binning somebody's
// pictures because they declined a suggestion would be indefensible, and it
// teaches them never to tap No again.
//
// But kept is not the same as findable. Until now a loose pile landed in
// "All photos" interleaved with everything else and unlabelled, so the sheet
// promised "they're in Photos, and they can be turned into one whenever you
// like" and the app quietly did neither half visibly. This is the half that
// makes the promise true.
//
// Nothing here talks to the network. The rows arrive already loaded by the
// Photos tab, and this only decides what they add up to.

import { clusterPhotos, looksOngoing, suggestTitle } from './tripFromPhotos.js'

/**
 * A stored photo row in the shape clusterPhotos reads.
 *
 * The clusterer was written for files coming off a phone, where the date is
 * an EXIF string called takenAt. A row that has been through the database
 * carries taken_at and taken_on instead — and often only taken_on, because
 * plenty of photographs know their day and not their minute. Midday rather
 * than midnight for those: a photograph dated to the day is equally likely
 * to be either side of it, and midnight lands on the wrong side of a
 * timezone about half the time.
 */
export function asMeta(row) {
  const at = row?.taken_at ?? (row?.taken_on ? `${String(row.taken_on).slice(0, 10)}T12:00:00Z` : null)
  return { ...row, takenAt: at }
}

/** Only the ones with no trip. Written as a filter so callers cannot forget. */
export function looseOnes(rows = []) {
  return rows.filter((r) => r && r.trip_id == null)
}

/**
 * What a loose pile amounts to.
 *
 * @returns { count, clusters, undated } — clusters newest first, because the
 *          offer is about what somebody did most recently and a list that
 *          opens on 2019 buries the answer they wanted.
 */
export function pileOf(rows = []) {
  const loose = looseOnes(rows)
  if (!loose.length) return { count: 0, clusters: [], undated: [] }
  const { clusters, undated } = clusterPhotos(loose.map(asMeta))
  const newestFirst = [...clusters].sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0))
  return { count: loose.length, clusters: newestFirst, undated }
}

/** The row a trip made from this cluster should be inserted with. */
export function tripFrom(cluster, now = Date.now()) {
  if (!cluster?.start) return null
  return {
    title: suggestTitle(cluster),
    start_date: cluster.start,
    // Open-ended when the last photograph is recent enough that the trip
    // might still be going — the same judgement the upload flow makes, so
    // both doors produce the same kind of trip.
    end_date: looksOngoing(cluster, now) ? null : cluster.end,
    countries: [],
    status: 'confirmed',
    sort_order: 0,
  }
}

/** The ids to move onto the new trip. */
export function idsIn(cluster) {
  return (cluster?.photos ?? []).map((p) => p?.id).filter(Boolean)
}
