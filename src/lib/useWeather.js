import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { askArchive, placesByDay, stillToAsk } from './weather.js'

/**
 * The weather for a trip, by day, fetched once and then never again.
 *
 * Reads what is cached, asks the archive for whatever is missing, stores
 * that, and hands back the lot keyed by date.
 *
 * Everything about this is best-effort. A day without weather is a day
 * without a small symbol beside it, which is a thing nobody notices; a
 * screen that fails to draw because a weather service was slow is a thing
 * everybody notices. So every failure here is swallowed and the hook simply
 * returns less.
 *
 * The write is attempted and its refusal ignored on purpose: somebody
 * reading a shared trip they cannot edit still gets the weather on screen,
 * from the cache the owner filled, and their attempt to add to it fails
 * quietly rather than telling them off for looking at somebody's holiday.
 */
export function useWeather(tripId, photos = []) {
  const [byDate, setByDate] = useState({})

  // Recomputed from the photographs rather than held: this is derived data
  // and holding it would be one more thing to keep in step.
  const wanted = placesByDay(photos)
  const key = wanted.map((w) => w.on_date).join(',')

  useEffect(() => {
    if (!tripId || !wanted.length) return
    let alive = true

    ;(async () => {
      const { data: cached } = await supabase
        .from('day_weather')
        .select('on_date,high_c,low_c,code')
        .eq('trip_id', tripId)
      if (!alive) return

      const have = cached ?? []
      const fold = (rows) => {
        const out = {}
        for (const r of rows) if (r?.on_date) out[r.on_date] = r
        return out
      }
      setByDate(fold(have))

      const missing = stillToAsk(wanted, have)
      if (!missing.length) return

      const fresh = await askArchive(missing)
      if (!alive || !fresh.length) return

      setByDate((now) => ({ ...now, ...fold(fresh) }))
      // Stored for next time, if this person is allowed to. A reader of
      // somebody else's trip is not, and that is fine — they have already
      // seen it.
      await supabase
        .from('day_weather')
        .upsert(fresh.map((r) => ({ ...r, trip_id: tripId })), { onConflict: 'trip_id,on_date' })
        .then(() => {}, () => {})
    })()

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, key])

  return byDate
}
