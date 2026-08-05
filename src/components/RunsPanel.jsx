import { lazy, Suspense, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import RunThumb from './RunThumb.jsx'

// Leaflet only arrives if someone actually opens a run. The recap already
// warms this chunk on idle, so by then it's a render rather than a fetch.
const RunMap = lazy(() => import('./RunMap.jsx'))

// Tapping "64 km run" on a recap used to open the whole Map tab: a general
// trip map with filters for hotels and photos, a dashed flight line across
// the East China Sea, and the runs somewhere in among it. The figure counts
// runs, so this counts runs back — each one with the shape you actually ran,
// the pace you ran it at, and what your heart made of it.

const fmtDate = (d) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''

// "6:44/km" and "5:25" are both in the table; the unit is the same either
// way, so say it once.
const fmtPace = (p) => (p ? `${String(p).replace(/\/km$/, '')} /km` : null)

export default function RunsPanel({ trip }) {
  const [runs, setRuns] = useState(null)
  // A card that shows a route and a pace looks like it opens; it should.
  // Tapping one draws the trace big — 96px of squiggle is a thumbnail, not a
  // route — and brings out what the row had no space for.
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (!trip?.id) return
    let alive = true
    supabase
      .from('runs')
      .select('id,label,city,run_date,distance_km,pace,hr_avg,hr_max,elevation_m,color,coords')
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
        const isOpen = open === r.id
        const hasTrack = (r.coords || []).length >= 2
        const pace = fmtPace(r.pace)
        return (
          <article
            className={`run-card${isOpen ? ' open' : ''}`}
            key={r.id}
            style={{ '--run-color': r.color || '#3E7D54' }}
          >
            <button className="run-row" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
              <div className="run-track">
                <RunThumb coords={r.coords} color={r.color || '#3E7D54'} />
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
            </button>

            {isOpen && (
              <div className="run-open">
                {/* A trace on a blank card is a squiggle. On a map it's a
                    route — you can see it followed a river, or went up and
                    came back down the same street. */}
                {hasTrack ? (
                  <Suspense fallback={<div className="run-map-loading" />}>
                    <RunMap coords={r.coords} color={r.color || '#3E7D54'} />
                  </Suspense>
                ) : (
                  <p className="run-no-track">No GPS trace for this one.</p>
                )}
                {/* The label is the only place the run says what it was —
                    "Tokyo Shinjuku / Yoyogi" — and the row had no room. */}
                {r.label && <div className="run-label">{r.label}</div>}
                <div className="run-stats">
                  <span><strong>{Number(r.distance_km).toFixed(2)}</strong> km</span>
                  {pace && <span><strong>{pace.replace(' /km', '')}</strong> /km</span>}
                  {r.hr_avg && <span><strong>{r.hr_avg}</strong> bpm avg</span>}
                  {r.hr_max && <span><strong>{r.hr_max}</strong> bpm max</span>}
                  {r.elevation_m ? <span><strong>{r.elevation_m}</strong> m up</span> : null}
                </div>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
