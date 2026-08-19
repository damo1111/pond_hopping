import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { thumb } from '../../lib/imgTransform.js'
import PhotoUpload from '../PhotoUpload.jsx'
import PhotoLens from '../PhotoLens.jsx'

// The planner is where a trip lives while it is still happening, which makes
// it the right place to put photos on it. The recap's photo sheet is a look
// back and stays read-only; this is the way in.
//
// Every photo added here with a GPS fix is a point on the trip's map and a
// day the timeline can reconstruct without anyone typing anything.

/** PostgREST caps a response at 1,000 rows and says nothing about it, so a
 *  short page is the only end-of-data there is. */
const PAGE = 500

export default function PlannerPhotos({ trip }) {
  const [photos, setPhotos] = useState(null)
  // Which photograph is open, or null. An index rather than a row, because
  // the viewer walks the set and the set is what it walks.
  const [open, setOpen] = useState(null)

  const load = useCallback(() => {
    if (!trip?.id) return
    let stop = false
    ;(async () => {
      // Paged, not limited.
      //
      // .limit(120) meant a trip with more than that quietly showed 120 and
      // said "120 photos" underneath, which is not a truncation anybody can
      // see. The same fault PhotosTab had, fixed there and not here.
      let all = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('photos')
          .select('id,url,thumb_url,caption,city,taken_on,taken_at,lat')
          .eq('trip_id', trip.id)
          // A receipt is filed under the cost it paid for, not shown here.
          .neq('kind', 'receipt')
          .order('taken_at', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error || !data) break
        all = all.concat(data)
        if (data.length < PAGE) break
      }
      if (!stop) setPhotos(all)
    })()
    return () => { stop = true }
  }, [trip?.id])

  useEffect(load, [load])

  const located = (photos ?? []).filter((p) => p.lat != null).length

  return (
    <div className="pp">
      <PhotoUpload trip={trip} onDone={load} />

      {photos === null ? (
        <div className="tab-loading">loading photos…</div>
      ) : photos.length === 0 ? (
        <p className="pp-empty">
          Nothing yet. Anything you add with a location on it puts itself on this trip's map.
        </p>
      ) : (
        <>
          <div className="pp-count">
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
            {located > 0 && ` · ${located} on the map`}
          </div>
          <div className="pp-grid">
            {/* A button, not an image.
                These were bare <img> tags with no handler on them at all —
                not a broken viewer, no viewer — so the grid was a contact
                sheet you could look at and not open. */}
            {photos.map((p, at) => (
              <button key={p.id} className="pp-shot" onClick={() => setOpen(at)}>
                <img
                  src={p.thumb_url || thumb(p.url, { width: 300, height: 300 })}
                  alt={p.caption || ''}
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              </button>
            ))}
          </div>
        </>
      )}

      {open !== null && photos && (
        <PhotoLens photos={photos} at={open} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
