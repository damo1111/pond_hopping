import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { gapAs, inShort, weave, whatLedToIt } from '../lib/sessionStory.js'

// Reading a tester's session back, in the order it happened.
//
// The data has been there for weeks. app_events knows what they did,
// app_errors knows what threw, and now bug_reports knows what they said —
// and reading them meant three queries whose results you interleaved by
// timestamp in your head. That is why a bug report took twenty minutes: not
// missing data, nothing putting it in order.
//
// The failure this is really built against is the other one. Most of what a
// tester reports never throws at all. "The button did nothing", "it went
// back to the start", "the photo didn't add" — every one of those arrived
// this fortnight, not one of them raised an exception, and app_errors was
// empty for all three. What identifies them is the sequence: two taps on the
// same control, thirty seconds apart, with nothing in between.
//
// Admin only. reports_in() and what_happened() both check is_admin() and
// return no rows otherwise, which is indistinguishable from a quiet week —
// so this asks separately before deciding whether to exist at all.

const whenish = (iso) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

const clock = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function TesterSessions() {
  const [admin, setAdmin] = useState(false)
  const [reports, setReports] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [story, setStory] = useState(null)

  useEffect(() => {
    supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true))
  }, [])

  const load = useCallback(() => {
    supabase.rpc('reports_in', { p_days: 14 }).then(({ data }) => setReports(data ?? []))
  }, [])

  useEffect(() => {
    if (admin) load()
  }, [admin, load])

  const openSession = async (report) => {
    if (openId === report.id) {
      setOpenId(null)
      setStory(null)
      return
    }
    setOpenId(report.id)
    setStory(null)
    const { data } = await supabase.rpc('what_happened', {
      p_session: report.session_id,
      p_hours: 48,
    })
    setStory(weave(data ?? []))
  }

  const handle = async (report) => {
    await supabase.rpc('report_handled', { p_id: report.id, p_done: !report.handled_at })
    load()
  }

  if (!admin) return null

  return (
    <section className="account-card">
      <div className="account-card-title">What testers said</div>

      {reports === null ? (
        <div className="account-card-body">Looking…</div>
      ) : reports.length === 0 ? (
        <div className="account-card-body">
          Nothing reported in the last fortnight. The card on this screen is how anybody sends one,
          and the crash screen offers it too.
        </div>
      ) : (
        <ul className="ts-list">
          {reports.map((r) => {
            const open = openId === r.id
            const short = open && story ? inShort(story) : null
            const led = open && story ? whatLedToIt(story) : null
            return (
              <li key={r.id} className={`ts-item${r.handled_at ? ' ts-item--done' : ''}`}>
                <button className="ts-head" onClick={() => openSession(r)}>
                  <span className="ts-said">{r.said}</span>
                  <span className="ts-meta">
                    {whenish(r.created_at)} · {r.platform || 'web'} · build {r.build || '?'}
                    {r.tab ? ` · ${r.tab}` : ''}
                    {r.errors_before > 0 ? ` · ${r.errors_before} broke` : ''}
                  </span>
                </button>

                {open && (
                  <div className="ts-story">
                    {story === null ? (
                      <div className="ts-line ts-line--quiet">Reading the session…</div>
                    ) : story.length === 0 ? (
                      <div className="ts-line ts-line--quiet">
                        Nothing recorded for this session in the last 48 hours — the report is all
                        there is.
                      </div>
                    ) : (
                      <>
                        <div className="ts-short">
                          {short.did} steps · {short.lasted}
                          {short.broke > 0 ? ` · ${short.broke} broke` : ' · nothing threw'}
                        </div>

                        {/* The question every report is actually asking, put
                            at the top rather than left to be found by
                            scrolling. */}
                        {led && (
                          <div className="ts-led">
                            <span className="ts-led-title">Just before it broke</span>
                            {led.before.map((b, i) => (
                              <span key={i} className="ts-led-step">
                                {b.what}
                              </span>
                            ))}
                            <span className="ts-led-broke">{led.broke.what}</span>
                          </div>
                        )}

                        <ol className="ts-steps">
                          {story.map((line, i) => (
                            <li key={i} className={`ts-line ts-line--${line.kind}`}>
                              <span className="ts-at">{clock(line.at)}</span>
                              <span className="ts-what">
                                {line.what}
                                {line.detail?.where ? (
                                  <span className="ts-where">{line.detail.where}</span>
                                ) : null}
                              </span>
                              {/* A pause is where somebody stopped to work
                                  out what to do, which is usually what the
                                  report turns out to be about. */}
                              {line.paused && <span className="ts-gap">{gapAs(line.since)}</span>}
                            </li>
                          ))}
                        </ol>
                      </>
                    )}

                    <button className="ts-done" onClick={() => handle(r)}>
                      {r.handled_at ? 'Put it back in the inbox' : 'Mark as dealt with'}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
