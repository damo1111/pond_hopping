import { useContext } from 'react'
import { TripContext } from '../App.jsx'

function fmtRange(t) {
  if (!t.start_date) return t.subtitle || 'dates tbc'
  const opt = { day: 'numeric', month: 'short' }
  const s = new Date(t.start_date).toLocaleDateString('en-GB', opt)
  const e = t.end_date ? new Date(t.end_date).toLocaleDateString('en-GB', opt) : null
  const year = new Date(t.start_date).getFullYear()
  return e ? `${s} – ${e} ${year}` : `${s} ${year}`
}

export default function TripsTab() {
  const { tripMeta, selectedTrip, setSelectedTrip } = useContext(TripContext)

  if (!tripMeta.length) {
    return (
      <div className="placeholder">
        <div className="placeholder-code">trips</div>
        <div className="placeholder-note">No trips yet — run the schema + seed in Supabase.</div>
      </div>
    )
  }

  return (
    <div className="trips-grid">
      {tripMeta.map((t) => {
        const active = selectedTrip === t.slug
        const spend = Number(t.total_aud || 0)
        return (
          <button
            key={t.slug}
            className={`trip-card${active ? ' active' : ''}`}
            onClick={() => setSelectedTrip(active ? null : t.slug)}
          >
            {t.cover_photo_url && (
              <div className="trip-cover">
                <img src={t.cover_photo_url} alt="" loading="lazy" />
              </div>
            )}
            <div className="trip-card-body">
              <div className="trip-flags">{t.countries?.join(' ')}</div>
              <div className="trip-card-title">{t.title}</div>
              {t.subtitle && <div className="trip-card-sub">{t.subtitle}</div>}
              <div className="trip-card-dates">{fmtRange(t)}</div>
              <div className="trip-stats">
                {t.flight_count > 0 && <span className="stat-pill">✈ {t.flight_count}</span>}
                {t.run_count > 0 && <span className="stat-pill">🏃 {t.run_count}</span>}
                {t.journal_count > 0 && <span className="stat-pill">📔 {t.journal_count}</span>}
                {spend > 0 && (
                  <span className="stat-pill">A${spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                )}
                {t.flight_count === 0 && t.run_count === 0 && t.journal_count === 0 && (
                  <span className="stat-pill muted">no data yet</span>
                )}
              </div>
              {active && <div className="trip-filter-note">filtering other tabs · tap to clear</div>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
