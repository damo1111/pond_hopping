import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { idsIn, pileOf, tripFrom } from '../lib/loosePhotos.js'
import { slugify, summarise } from '../lib/tripFromPhotos.js'
import { oops, track } from '../lib/analytics.js'

// The photographs somebody kept without making a trip, said out loud.
//
// The upload flow asks "this looks like a trip", and "no, keep them loose"
// has to be a real answer — so the pictures go up anyway, with no trip on
// the other end. The sheet then says "they're in Photos, and they can be
// turned into one whenever you like", and until now both halves of that were
// only technically true: the photographs landed in All photos interleaved
// with everything else and unlabelled, and there was no way to turn them
// into anything.
//
// This is the band that makes it true. Only where there is something to say
// — no loose photographs, no band — because a permanent empty shelf on the
// Photos tab would be worse than the problem.

export default function LoosePile({ rows = [], only, onOnly, onChanged }) {
  const pile = useMemo(() => pileOf(rows), [rows])
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  if (!pile.count) return null

  /**
   * Turn one run of them into a trip.
   *
   * The files do not move. A loose photograph lives at loose/<uid>/… in the
   * bucket and its row's url points there; giving the row a trip changes
   * which screen it appears on, not where the bytes are. Moving them would
   * be a second failure mode for no gain — and the storage policy that lets
   * its owner read it is about the uid in the path, not the trip.
   */
  async function makeIt(cluster) {
    const row = tripFrom(cluster)
    if (!row) return
    const ids = idsIn(cluster)
    if (!ids.length) return
    setBusy(cluster.start)
    setError(null)
    try {
      // Slugs are deterministic, so the same run asked for twice wants the
      // same one. One retry with a tail rather than a random slug every
      // time: the trip should be allowed to be the same trip on a second go.
      let made = await supabase
        .from('trips')
        .insert({ ...row, slug: slugify(row.title, row.start_date) })
        .select('id,slug')
        .single()
      if (made.error?.code === '23505') {
        made = await supabase
          .from('trips')
          .insert({ ...row, slug: slugify(row.title, row.start_date, Date.now()) })
          .select('id,slug')
          .single()
      }
      if (made.error || !made.data) throw made.error ?? new Error('no trip row')

      const { error: moved } = await supabase
        .from('photos')
        .update({ trip_id: made.data.id })
        .in('id', ids)
      if (moved) {
        // A trip with no photographs in it is not a trip, and leaving one
        // behind is exactly the litter the upload flow already learned to
        // clean up after itself.
        await supabase.from('trips').delete().eq('id', made.data.id)
        throw moved
      }

      track('loose_made_trip', { photos: ids.length })
      onChanged?.()
    } catch (e) {
      oops('photos', e, 'LoosePile/makeIt')
      setError(e?.message || 'That would not save. Worth trying again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="loose-pile">
      <div className="loose-head">
        <span className="loose-count">
          {pile.count} photo{pile.count === 1 ? '' : 's'}, no trip
        </span>
        <button className="loose-only" onClick={() => onOnly?.(!only)}>
          {only ? 'Show everything' : 'Show only these'}
        </button>
      </div>

      <div className="loose-say">
        Kept when you said they weren&apos;t a trip. They can become one whenever you like.
      </div>

      {pile.clusters.map((c) => (
        <button
          key={c.start}
          className="loose-make"
          disabled={busy === c.start}
          onClick={() => makeIt(c)}
        >
          <span className="loose-make-what">{summarise(c)}</span>
          <span className="loose-make-do">{busy === c.start ? 'making…' : 'Make it a trip'}</span>
        </button>
      ))}

      {/* Said rather than hidden. Photographs with no date cannot be sorted
          into a trip by this route, and quietly leaving them out of every
          button while counting them at the top would look like a bug. */}
      {pile.undated.length > 0 && (
        <div className="loose-say loose-undated">
          {pile.undated.length} of them {pile.undated.length === 1 ? 'carries' : 'carry'} no date, so
          {pile.undated.length === 1 ? ' it stays' : ' they stay'} here until you file{' '}
          {pile.undated.length === 1 ? 'it' : 'them'} by hand.
        </div>
      )}

      {error && <div className="account-error">{error}</div>}
    </div>
  )
}
