import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { claimedKm, findConflicts, nextQuestion, samePattern } from '../lib/flightAttribution.js'

// An imported logbook is yours until proven otherwise, so this screen never
// asks "who flew this?" about a flight it has no reason to doubt. It asks
// only where the assumption breaks — two aeroplanes at once, or a departure
// from an airport you weren't at — and it asks about one at a time.
//
// On this account that's 142 questions instead of 821, and each answer
// re-knits the itinerary around the hole it leaves, so the count falls
// faster than one per tap and reaches zero.

const SELECT =
  'id,flight_number,airline,dep_airport,arr_airport,dep_city,arr_city,dep_time,arr_time,distance_km,cabin,travellers,travellers_confirmed_at,status'

const fmtDay = (iso) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso)
  )
const fmtTime = (iso) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(
    new Date(iso)
  )
const fmtGap = (ms) => {
  const h = Math.round(Math.abs(ms) / 3600000)
  if (h < 1) return 'minutes'
  if (h < 48) return `${h} hours`
  return `${Math.round(h / 24)} days`
}

// The people this account can attribute a flight to: whoever is signed in,
// plus anyone they're connected to. No names are baked in — a household of
// one sees one button, a family of five sees five — and profile reads are
// scoped to people you actually know, so this can't enumerate the userbase.
function useRoster(user, profile) {
  const [others, setOthers] = useState([])
  useEffect(() => {
    if (!user?.id) return
    let alive = true
    supabase
      .from('profiles')
      .select('id,email,display_name')
      .neq('id', user.id)
      .then(({ data }) => alive && setOthers((data ?? []).filter((p) => p.email)))
    return () => {
      alive = false
    }
  }, [user?.id])

  const me = { email: (user?.email || '').toLowerCase() }
  const partnerEmail = profile?.partner_email?.toLowerCase()
  const partner = partnerEmail
    ? others.find((o) => o.email.toLowerCase() === partnerEmail)
    : undefined
  const rest = others.filter((o) => o !== partner)
  return { me, partner, rest }
}

export default function FlightTriage({ onClose, onChanged }) {
  const { user, profile } = useAuth()
  const email = (user?.email || '').toLowerCase()
  const { me, partner, rest } = useRoster(user, profile)

  const [flights, setFlights] = useState(null)
  const [history, setHistory] = useState([]) // undo stack
  const [skipped, setSkipped] = useState(() => new Set())
  const [applyPattern, setApplyPattern] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [startKm, setStartKm] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('flights')
      .select(SELECT)
      .order('dep_time', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setError(error.message)
        else setFlights(data ?? [])
      })
    return () => {
      alive = false
    }
  }, [])

  const question = useMemo(
    () => (email && flights ? nextQuestion(flights, email, skipped) : null),
    [flights, email, skipped]
  )
  const km = useMemo(() => (flights ? claimedKm(flights, email) : 0), [flights, email])
  useEffect(() => {
    if (startKm == null && flights) setStartKm(claimedKm(flights, email))
  }, [flights, email, startKm])

  const pattern = useMemo(
    () => (question && flights ? samePattern(flights, question.flight, email) : []),
    [question, flights, email]
  )

  const apply = useCallback(
    async (ids, travellers, cancelled = false) => {
      setSaving(true)
      setError(null)
      const patch = cancelled
        ? { status: 'cancelled', travellers_confirmed_at: new Date().toISOString() }
        : { travellers, travellers_confirmed_at: new Date().toISOString() }
      // Ask for the rows back: row-level security refuses a write by matching
      // nothing rather than erroring, so without this a signed-out reader
      // would watch the counter move and nothing be saved.
      const { data, error } = await supabase.from('flights').update(patch).in('id', ids).select(SELECT)
      setSaving(false)
      if (error) return setError(error.message)
      if (!data?.length)
        return setError('That didn’t save — you need to be signed in to answer these.')

      const byId = new Map(data.map((f) => [f.id, f]))
      setFlights((prev) => prev.map((f) => byId.get(f.id) ?? f))
      setHistory((prev) => [...prev, { ids, before: ids.map((id) => flights.find((f) => f.id === id)) }])
      onChanged?.()
    },
    [flights, onChanged]
  )

  async function undo() {
    const last = history.at(-1)
    if (!last) return
    setSaving(true)
    for (const f of last.before) {
      await supabase
        .from('flights')
        .update({
          travellers: f.travellers,
          travellers_confirmed_at: f.travellers_confirmed_at,
          status: f.status,
        })
        .eq('id', f.id)
    }
    setSaving(false)
    const byId = new Map(last.before.map((f) => [f.id, f]))
    setFlights((prev) => prev.map((f) => byId.get(f.id) ?? f))
    setHistory((prev) => prev.slice(0, -1))
    onChanged?.()
  }

  if (error && !flights) return <div className="error-note">review: {error}</div>
  if (!flights) return <div className="tab-loading">working out what needs asking…</div>
  if (!email)
    return (
      <div className="placeholder">
        <div className="placeholder-code">sign in</div>
        <div className="placeholder-note">Attributing flights needs to know who you are.</div>
      </div>
    )

  const outstanding = findConflicts(flights, email).filter((c) => c.kind !== 'gap')
  const openCount = new Set(
    outstanding.flatMap((c) => [c.a.id, c.b.id]).filter((id) => !skipped.has(id))
  ).size

  if (!question) {
    return (
      <div className="triage triage-done">
        <header className="triage-head">
          <button className="triage-close" onClick={onClose} aria-label="Back">←</button>
          <div className="triage-head-text">
            <div className="triage-title">Nothing left to check</div>
          </div>
        </header>
        <div className="triage-finale">
          <div className="tf-km">{km.toLocaleString()} km</div>
          <div className="tf-note">
            {skipped.size > 0
              ? `Your itinerary holds together. ${skipped.size} skipped — come back to them any time.`
              : 'Your itinerary holds together: no flight overlaps another, and every departure follows an arrival. Everything not marked otherwise is yours.'}
          </div>
          {skipped.size > 0 && (
            <button className="triage-choice" onClick={() => setSkipped(new Set())}>
              Revisit skipped
            </button>
          )}
          <button className="triage-choice" onClick={onClose}>Done</button>
        </div>
      </div>
    )
  }

  const f = question.flight
  const choices = [
    { label: 'Me', travellers: [me.email] },
    partner && { label: `${partner.display_name || 'Partner'} & me`, travellers: [me.email, partner.email] },
    partner && { label: partner.display_name || 'Them', travellers: [partner.email] },
    ...rest.map((p) => ({ label: p.display_name || p.email, travellers: [p.email] })),
    { label: 'Someone else', travellers: [], hint: 'Kept in the log, not counted as yours' },
  ].filter(Boolean)

  const done = history.length

  return (
    <div className="triage">
      <header className="triage-head">
        <button className="triage-close" onClick={onClose} aria-label="Back">←</button>
        <div className="triage-head-text">
          <div className="triage-title">{openCount} to check</div>
          <div className="triage-sub">
            {km.toLocaleString()} km yours
            {startKm != null && km !== startKm ? ` · ${(startKm - km).toLocaleString()} km set aside` : ''}
          </div>
        </div>
        {done > 0 && (
          <button className="triage-undo" onClick={undo} disabled={saving}>Undo</button>
        )}
      </header>

      {error && <div className="error-note">{error}</div>}

      {/* The clash, first — it's what makes the question answerable. Being
          told "you were over the Atlantic at the time" is what jogs the
          memory; "was this you?" on its own does not. */}
      <div className="triage-why">
        {question.against.map((c, i) => (
          <p key={i}>
            {c.kind === 'overlap' ? (
              <>
                You'd already be aboard <b>{c.other.flight_number}</b> {c.other.dep_airport}→
                {c.other.arr_airport}, in the air from {fmtTime(c.other.dep_time)} to{' '}
                {fmtTime(c.other.arr_time)}.
              </>
            ) : (
              <>
                Your previous flight landed at <b>{c.other.arr_airport}</b>
                {c.other.arr_time ? ` at ${fmtTime(c.other.arr_time)}` : ''} — {fmtGap(c.gapMs)} isn't
                enough to reach {f.dep_airport}.
              </>
            )}
          </p>
        ))}
      </div>

      <section className="triage-question">
        <div className="tq-when">{fmtDay(f.dep_time)}</div>
        <div className="tq-route">
          <span className="tq-code">{f.dep_airport}</span>
          <span className="tq-arrow">→</span>
          <span className="tq-code">{f.arr_airport}</span>
        </div>
        <div className="tq-city">
          {f.dep_city} to {f.arr_city}
        </div>
        <div className="tq-meta">
          {[f.flight_number, f.airline, f.cabin, f.distance_km ? `${f.distance_km.toLocaleString()} km` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </section>

      {/* Someone who tracked a friend's shuttle hops tracked all of them, so
          one answer is offered for the whole habit rather than asked 47
          times. Opt-out, because the common case is that it's right. */}
      {pattern.length > 0 && (
        <label className="triage-pattern">
          <input
            type="checkbox"
            checked={applyPattern}
            onChange={(e) => setApplyPattern(e.target.checked)}
          />
          <span>
            Apply to the {pattern.length} other {f.dep_airport}→{f.arr_airport} flight
            {pattern.length === 1 ? '' : 's'} on {(f.flight_number || '').replace(/\d+$/, '')} too
          </span>
        </label>
      )}

      <div className="triage-choices">
        {choices.map((c) => (
          <button
            key={c.label}
            className="triage-choice"
            disabled={saving}
            title={c.hint}
            onClick={() =>
              apply(
                applyPattern && pattern.length ? [f.id, ...pattern.map((p) => p.id)] : [f.id],
                c.travellers
              )
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="triage-secondary">
        <button
          className="triage-choice triage-choice-no"
          disabled={saving}
          onClick={() => apply([f.id], null, true)}
        >
          Didn't happen
        </button>
        <button
          className="triage-choice triage-choice-skip"
          disabled={saving}
          onClick={() => setSkipped((prev) => new Set(prev).add(f.id))}
        >
          Not sure — skip
        </button>
      </div>
    </div>
  )
}
