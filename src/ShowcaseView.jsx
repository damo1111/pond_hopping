import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { coverUrl, thumb } from './lib/imgTransform.js'
import CountryFlags from './components/CountryFlags.jsx'
import { words } from './lib/sport.js'

// The whole travel log, read-only, behind one revocable link.
//
// Trips are private by default, which is right, and it also left no way to
// show anyone anything — the old per-trip ?share= links read through the anon
// key and now return nothing at all. This is the replacement, and it is a
// different shape on purpose: one link for everything, revocable, rather than
// a permanent public flag on each trip.
//
// Everything arrives in a single RPC. The token is resolved inside a
// SECURITY DEFINER function in the database, so the page ships no service
// key, cannot enumerate links, and gets expiry and revocation for free.
// private_notes are excluded there, unconditionally, on every trip.

const fmtRange = (t) => {
  if (!t.start_date) return ''
  const o = { day: 'numeric', month: 'short', year: 'numeric' }
  const a = new Date(t.start_date).toLocaleDateString('en-GB', o)
  const b = t.end_date ? new Date(t.end_date).toLocaleDateString('en-GB', o) : null
  return b && b !== a ? `${a} – ${b}` : a
}

const num = (n) => (n ?? 0).toLocaleString('en-GB')

export default function ShowcaseView({ token }) {
  const [payload, setPayload] = useState(undefined) // undefined = loading, null = no
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .rpc('showcase_payload', { t: token })
      .then(({ data, error }) => alive && setPayload(error ? null : data))
    return () => {
      alive = false
    }
  }, [token])

  const totals = useMemo(() => {
    const trips = payload?.trips ?? []
    return {
      trips: trips.length,
      km: trips.reduce((s, t) => s + t.flights.reduce((a, f) => a + (f.distance_km || 0), 0), 0),
      flights: trips.reduce((s, t) => s + t.flights.length, 0),
      entries: trips.reduce((s, t) => s + t.entries.length, 0),
      photos: trips.reduce((s, t) => s + (t.photo_count || 0), 0),
      runKm: trips.reduce((s, t) => s + t.runs.reduce((a, r) => a + (r.distance_km || 0), 0), 0),
      countries: new Set(trips.flatMap((t) => t.countries || [])).size,
    }
  }, [payload])

  if (payload === undefined) return <div className="tab-loading">loading…</div>

  // A dead link says so plainly rather than looking like an empty account.
  if (!payload) {
    return (
      <div className="showcase-dead">
        <img src="/duck.png" alt="" width="52" height="52" />
        <div className="showcase-dead-title">This link isn’t active</div>
        <div className="showcase-dead-body">
          It may have been turned off by whoever shared it, or it has expired.
        </div>
      </div>
    )
  }

  const trips = payload.trips ?? []

  return (
    <div className="showcase">
      <header className="showcase-head">
        <div className="app-title">
          <span className="app-title-thin">Pond</span>
          <span className="app-title-bold">Hopping</span>
        </div>
        <div className="showcase-sub">{payload.label || 'A travel log'} · read only</div>
      </header>

      <section className="showcase-totals">
        {[
          [num(totals.trips), 'trips'],
          [num(totals.countries), 'countries'],
          [num(totals.flights), 'flights'],
          [num(Math.round(totals.km)), 'km flown'],
          [num(totals.entries), 'days written up'],
          [num(Math.round(totals.runKm)), 'km run'],
        ].map(([v, l]) => (
          <div className="showcase-total" key={l}>
            <div className="showcase-total-v">{v}</div>
            <div className="showcase-total-l">{l}</div>
          </div>
        ))}
      </section>

      <div className="showcase-trips">
        {trips.map((t) => {
          const isOpen = open === t.slug
          const km = t.flights.reduce((a, f) => a + (f.distance_km || 0), 0)
          return (
            <article key={t.slug} className={`showcase-trip${isOpen ? ' open' : ''}`}>
              <button
                className="showcase-trip-head"
                onClick={() => setOpen(isOpen ? null : t.slug)}
                aria-expanded={isOpen}
              >
                {t.cover_photo_url && (
                  <span className="showcase-cover">
                    <img
                      src={coverUrl(t.cover_photo_url, { width: 900, height: 500 })}
                      alt=""
                      loading="lazy"
                    />
                  </span>
                )}
                <span className="showcase-trip-text">
                  <span className="showcase-flags">
                    <CountryFlags countries={t.countries} size={18} />
                  </span>
                  <span className="showcase-trip-title">{t.title}</span>
                  <span className="showcase-trip-dates">{fmtRange(t)}</span>
                  <span className="showcase-trip-meta">
                    {t.flights.length > 0 && <>✈ {t.flights.length}&nbsp;&nbsp;</>}
                    {t.runs.length > 0 && <>{words(t.runs[0]?.sport).icon} {t.runs.length}&nbsp;&nbsp;</>}
                    {t.entries.length > 0 && <>📔 {t.entries.length}&nbsp;&nbsp;</>}
                    {km > 0 && <>{num(km)} km</>}
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="showcase-body">
                  {t.summary && <p className="showcase-summary">{t.summary}</p>}

                  {t.photos.length > 0 && (
                    <div className="showcase-photos">
                      {t.photos.map((p, i) => (
                        <img
                          key={i}
                          src={p.thumb_url || thumb(p.url)}
                          alt={p.caption || ''}
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}

                  {t.flights.length > 0 && (
                    <section className="showcase-section">
                      <h3>Flights</h3>
                      {t.flights.map((f, i) => (
                        <div className="showcase-flight" key={i}>
                          <span className="showcase-flight-route">
                            {f.dep_airport} → {f.arr_airport}
                          </span>
                          <span className="showcase-flight-meta">
                            {[f.flight_number, f.airline, f.distance_km && `${num(f.distance_km)} km`]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                      ))}
                    </section>
                  )}

                  {t.entries.length > 0 && (
                    <section className="showcase-section">
                      <h3>Journal</h3>
                      {t.entries.map((e, i) => (
                        <div className="showcase-entry" key={i}>
                          <div className="showcase-entry-head">
                            {new Date(e.entry_date).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                            })}
                            {e.city ? ` · ${e.city}` : ''}
                          </div>
                          <div className="showcase-entry-title">{e.title}</div>
                          {e.note && <p className="showcase-entry-note">{e.note}</p>}
                        </div>
                      ))}
                    </section>
                  )}

                  {t.runs.length > 0 && (
                    <section className="showcase-section">
                      <h3>Runs</h3>
                      {t.runs.map((r, i) => (
                        <div className="showcase-flight" key={i}>
                          <span className="showcase-flight-route">
                            {r.distance_km?.toFixed(1)} km
                          </span>
                          <span className="showcase-flight-meta">
                            {[r.label, r.pace].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <footer className="showcase-foot">
        Made with Pond Hopping — <a href="/">pond.eend.app</a>
      </footer>
    </div>
  )
}
