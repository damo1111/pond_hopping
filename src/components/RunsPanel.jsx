import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Tapping "64 km run" on a recap used to open the whole Map tab: a general
// trip map with filters for hotels and photos, a dashed flight line across
// the East China Sea, and the runs somewhere in among it. The figure counts
// runs, so this counts runs back — each one with the shape you actually ran,
// the pace you ran it at, and what your heart made of it.

// Equirectangular is wrong at continental scale and exactly right at the
// scale of a morning run, and it costs nothing — no tiles, no Leaflet, so
// the sheet opens on the frame it's asked to rather than after a fetch.
function trackPath(coords, w, h, pad = 6) {
  const pts = (coords || []).filter((c) => Array.isArray(c) && c.length >= 2)
  if (pts.length < 2) return null
  const lats = pts.map((c) => c[0])
  const lons = pts.map((c) => c[1])
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const k = Math.cos((midLat * Math.PI) / 180)
  const xs = lons.map((l) => l * k)
  const ys = lats.map((l) => -l)
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const y0 = Math.min(...ys), y1 = Math.max(...ys)
  // A there-and-back along one street is a legitimate run and a zero-width
  // box; falling back to the other axis keeps it from dividing by nothing.
  const spanX = x1 - x0 || y1 - y0 || 1
  const spanY = y1 - y0 || x1 - x0 || 1
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
  const offX = (w - spanX * scale) / 2
  const offY = (h - spanY * scale) / 2
  return pts
    .map((_, i) => {
      const x = (xs[i] - x0) * scale + offX
      const y = (ys[i] - y0) * scale + offY
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

const fmtDate = (d) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''

// "6:44/km" and "5:25" are both in the table; the unit is the same either
// way, so say it once.
const fmtPace = (p) => (p ? `${String(p).replace(/\/km$/, '')} /km` : null)

export default function RunsPanel({ trip }) {
  const [runs, setRuns] = useState(null)

  useEffect(() => {
    if (!trip?.id) return
    let alive = true
    supabase
      .from('runs')
      .select('id,label,city,run_date,distance_km,pace,hr_avg,elevation_m,color,coords')
      .eq('trip_id', trip.id)
      .order('run_date', { ascending: true })
      .then(({ data }) => alive && setRuns(data ?? []))
    return () => {
      alive = false
    }
  }, [trip?.id])

  if (!runs) return <div className="tab-loading">loading runs…</div>
  if (!runs.length) {
    return (
      <div className="placeholder">
        <div className="placeholder-code">runs</div>
        <div className="placeholder-note">No runs logged for this trip.</div>
      </div>
    )
  }

  const km = runs.reduce((s, r) => s + (Number(r.distance_km) || 0), 0)
  const climb = runs.reduce((s, r) => s + (Number(r.elevation_m) || 0), 0)

  return (
    <div className="runs-panel">
      <div className="runs-total">
        <span className="rt-value">{km.toFixed(1)}</span>
        <span className="rt-label">km over {runs.length} runs</span>
        {climb > 0 && <span className="rt-climb">{climb.toLocaleString()} m climbed</span>}
      </div>

      {runs.map((r) => {
        const d = trackPath(r.coords, 96, 64)
        const pace = fmtPace(r.pace)
        return (
          <article className="run-card" key={r.id} style={{ '--run-color': r.color || '#3E7D54' }}>
            <div className="run-track">
              {d ? (
                <svg viewBox="0 0 96 64" width="96" height="64" aria-hidden="true">
                  <path d={d} fill="none" stroke="var(--run-color)" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                /* A run logged without a GPS trace still happened. */
                <span className="run-track-none" aria-hidden="true" />
              )}
            </div>
            <div className="run-body">
              <div className="run-head">
                <span className="run-date">{fmtDate(r.run_date)}</span>
                {r.city && <span className="run-city">{r.city}</span>}
              </div>
              <div className="run-figures">
                <span className="run-km">{Number(r.distance_km).toFixed(2)} km</span>
                {pace && <span className="run-pace">{pace}</span>}
              </div>
              {(r.hr_avg || r.elevation_m) && (
                <div className="run-meta">
                  {r.hr_avg ? `${r.hr_avg} bpm` : ''}
                  {r.hr_avg && r.elevation_m ? ' · ' : ''}
                  {r.elevation_m ? `${r.elevation_m} m up` : ''}
                </div>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
