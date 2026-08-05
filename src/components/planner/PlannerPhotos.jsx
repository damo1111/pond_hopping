import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { thumb } from '../../lib/imgTransform.js'
import PhotoUpload from '../PhotoUpload.jsx'

// The planner is where a trip lives while it is still happening, which makes
// it the right place to put photos on it. The recap's photo sheet is a look
// back and stays read-only; this is the way in.
//
// Every photo added here with a GPS fix is a point on the trip's map and a
// day the timeline can reconstruct without anyone typing anything.

export default function PlannerPhotos({ trip }) {
  const [photos, setPhotos] = useState(null)

  const load = useCallback(() => {
    if (!trip?.id) return
    supabase
      .from('photos')
      .select('id,url,thumb_url,caption,taken_on,lat')
      .eq('trip_id', trip.id)
      .order('taken_at', { ascending: true, nullsFirst: false })
      .limit(120)
      .then(({ data }) => setPhotos(data ?? []))
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
            {photos.map((p) => (
              <img
                key={p.id}
                src={p.thumb_url || thumb(p.url, { width: 300, height: 300 })}
                alt={p.caption || ''}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
