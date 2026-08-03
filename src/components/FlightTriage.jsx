import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Seventeen years of byAir history came in with no idea who was on board —
// byAir marks a flight "mine" whether David flew it, Seeby flew it, or David
// was just tracking a friend's plane. Nothing in the export can tell those
// apart, so this is the one screen where a person has to say.
//
// Answering 821 legs one at a time is a job nobody finishes, so they're
// clustered: any run of flights with no four-day gap is almost always one
// journey, which takes it to about 200 decisions. A cluster that turns out
// to be mixed can be opened and answered leg by leg.
const CLUSTER_GAP_MS = 4 * 24 * 60 * 60 * 1000

const CHOICES = [
  { key: 'David', label: 'Me' },
  { key: 'Both', label: 'DS & I' },
  { key: 'Seeby', label: 'DS' },
  { key: 'Other', label: 'Someone else' },
  { key: '__cancelled', label: "Didn't happen" },
]

function clusterFlights(flights) {
  const out = []
  for (const f of flights) {
    const last = out[out.length - 1]
    const gap = last ? Math.abs(Date.parse(f.dep_time) - Date.parse(last.at(-1).dep_time)) : Infinity
    if (last && gap <= CLUSTER_GAP_MS) last.push(f)
    else out.push([f])
  }
  return out
}

const fmtDate = (iso) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

// MEL → SIN → LHR rather than three separate pairs, so a connecting journey
// reads as one line. A leg that doesn't continue from the previous arrival
// starts a new run — that's usually the tell that a cluster holds two
// people's flights.
function routeChain(legs) {
  const parts = []
  for (const f of legs) {
    if (parts.at(-1) !== f.dep_airport) parts.push(parts.length ? '·' : null, f.dep_airport)
    parts.push(f.arr_airport)
  }
  return parts.filter(Boolean)
}

export default function FlightTriage({ onClose, onChanged }) {
  const [flights, setFlights] = useState(null)
  const [done, setDone] = useState([]) // undo stack: [{ ids, previous }]
  const [openCluster, setOpenCluster] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('flights')
      .select('id,flight_number,airline,dep_airport,arr_airport,dep_city,arr_city,dep_time,distance_km,cabin')
      .is('trip_id', null)
      .is('traveler', null)
      .eq('status', 'flown')
      .order('dep_time', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setError(error.message)
        else setFlights(data ?? [])
      })
    return () => {
      alive = false
    }
  }, [])

  const clusters = useMemo(() => clusterFlights(flights ?? []), [flights])

  async function answer(ids, choice) {
    setSaving(true)
    setError(null)
    const patch = choice === '__cancelled' ? { status: 'cancelled' } : { traveler: choice }
    // Ask for the changed rows back. Row-level security refuses a write by
    // matching no rows rather than erroring, so without this a signed-out
    // reader would watch cards disappear and nothing be saved.
    const { data, error } = await supabase.from('flights').update(patch).in('id', ids).select('id')
    setSaving(false)
    if (error) return setError(error.message)
    if (!data?.length) {
      setError("That didn't save — you need to be signed in as David or Seeby to answer these.")
      return
    }
    setFlights((prev) => prev.filter((f) => !ids.includes(f.id)))
    setDone((prev) => [...prev, { ids, choice }])
    setOpenCluster(null)
    onChanged?.()
  }

  async function undo() {
    const last = done.at(-1)
    if (!last) return
    setSaving(true)
    const patch = last.choice === '__cancelled' ? { status: 'flown' } : { traveler: null }
    const { data: undone, error } = await supabase
      .from('flights')
      .update(patch)
      .in('id', last.ids)
      .select('id')
    setSaving(false)
    if (error) return setError(error.message)
    if (!undone?.length) return setError("Couldn't undo that one.")
    setDone((prev) => prev.slice(0, -1))
    // Cheapest correct refresh: the undone legs go back where they were.
    const { data } = await supabase
      .from('flights')
      .select('id,flight_number,airline,dep_airport,arr_airport,dep_city,arr_city,dep_time,distance_km,cabin')
      .in('id', last.ids)
    setFlights((prev) =>
      [...(prev ?? []), ...(data ?? [])].sort((a, b) => b.dep_time.localeCompare(a.dep_time))
    )
    onChanged?.()
  }

  if (error && !flights) return <div className="error-note">review: {error}</div>
  if (!flights) return <div className="tab-loading">loading flights to review…</div>

  return (
    <div className="triage">
      <header className="triage-head">
        <button className="triage-close" onClick={onClose} aria-label="Close review">←</button>
        <div className="triage-head-text">
          <div className="triage-title">Who flew these?</div>
          <div className="triage-sub">
            {clusters.length
              ? `${clusters.length} to go · ${flights.length} legs`
              : 'All done — nothing left to review.'}
          </div>
        </div>
        {done.length > 0 && (
          <button className="triage-undo" onClick={undo} disabled={saving}>Undo</button>
        )}
      </header>

      {error && <div className="error-note">{error}</div>}

      {clusters.map((legs, i) => {
        const chain = routeChain(legs)
        const km = legs.reduce((s, f) => s + (f.distance_km || 0), 0)
        const first = legs.at(-1) // clusters arrive newest-first
        const last = legs[0]
        const span =
          first.dep_time.slice(0, 10) === last.dep_time.slice(0, 10)
            ? fmtDate(first.dep_time)
            : `${fmtDate(first.dep_time)} – ${fmtDate(last.dep_time)}`
        const open = openCluster === i
        return (
          <section key={legs[0].id} className="triage-card">
            <div className="triage-when">{span}</div>
            <div className="triage-chain">
              {chain.map((c, n) => (
                <span key={n} className={c === '·' ? 'tc-break' : 'tc-code'}>
                  {c}
                </span>
              ))}
            </div>
            <div className="triage-meta">
              {legs.length} {legs.length === 1 ? 'leg' : 'legs'} · {km.toLocaleString()} km ·{' '}
              {[...new Set(legs.map((f) => f.airline).filter(Boolean))].join(', ') || 'unknown airline'}
            </div>

            <div className="triage-choices">
              {CHOICES.map((c) => (
                <button
                  key={c.key}
                  className={`triage-choice${c.key === '__cancelled' ? ' triage-choice-no' : ''}`}
                  disabled={saving}
                  onClick={() => answer(legs.map((f) => f.id), c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {legs.length > 1 && (
              <button className="triage-expand" onClick={() => setOpenCluster(open ? null : i)}>
                {open ? 'Hide legs' : 'Answer leg by leg'}
              </button>
            )}

            {open &&
              legs.map((f) => (
                <div key={f.id} className="triage-leg">
                  <div className="triage-leg-what">
                    <span className="tl-num">{f.flight_number}</span>
                    <span className="tl-route">
                      {f.dep_airport} → {f.arr_airport}
                    </span>
                    <span className="tl-date">{fmtDate(f.dep_time)}</span>
                  </div>
                  <div className="triage-choices triage-choices-inline">
                    {CHOICES.map((c) => (
                      <button
                        key={c.key}
                        className={`triage-choice${c.key === '__cancelled' ? ' triage-choice-no' : ''}`}
                        disabled={saving}
                        onClick={() => answer([f.id], c.key)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </section>
        )
      })}

      {!clusters.length && (
        <div className="placeholder">
          <div className="placeholder-code">done</div>
          <div className="placeholder-note">Every imported flight has been attributed.</div>
        </div>
      )}
    </div>
  )
}
