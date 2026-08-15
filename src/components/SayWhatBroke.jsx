import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { track, whereWeAre, whoAmI } from '../lib/analytics.js'
import { readEnv, sendState, whatWeKnow, worthSending } from '../lib/whatBroke.js'

// One way to say something is wrong, on all three platforms.
//
// Everything that has gone wrong in this app for a fortnight was reported by
// somebody typing it into a chat window and pasting a screenshot. That works
// exactly once, for one tester, who happens to be the person who built it.
// It does not survive contact with five friendly testers, and the reports
// that matter most are the ones nobody bothers to send.
//
// What makes them not bother is the interrogation. Which build? What phone?
// Were you online? What were you doing just before? Nobody knows, and the
// answers that do come back are frequently wrong — twice this fortnight an
// identical message arrived from two different builds and the second reading
// cost a round of debugging a defect that was already fixed.
//
// So this asks one question. Everything else it already knows, and the
// session id it stamps means the whole of what they did is readable
// afterwards — see what_happened() and the Sessions card on Account.
//
// ── Why it does not need an account ──────────────────────────────────────
//
// report_a_problem() is granted to anon on purpose. Somebody who cannot get
// past the sign-in screen has the single most valuable thing to say, and
// asking them to sign in first is asking them to do the thing that is
// broken. There is a ceiling of twenty an hour per session in the function
// itself, which is where a limit belongs rather than in this file.

export default function SayWhatBroke({ open, onClose, hint = null, context = null }) {
  const [said, setSaid] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!open) return null

  const state = sendState({ said, sending, sent, failed })

  const send = async () => {
    if (!worthSending(said)) return
    setSending(true)
    setFailed(false)
    const facts = whatWeKnow({
      build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev',
      // Where analytics already thinks we are, so a report and the events
      // around it agree about which screen this was. `context` overrides it
      // for callers that know better — the crash screen, above all, which is
      // not on a tab at all.
      where: context ?? whereWeAre(),
      env: readEnv(),
    })
    try {
      const { error } = await supabase.rpc('report_a_problem', {
        p_session: whoAmI(),
        p_said: said,
        p_build: facts.build,
        p_tab: facts.tab,
        p_trip: facts.trip,
        p_platform: facts.platform,
        p_screen: facts.screen,
        p_agent: facts.agent,
        p_online: facts.online,
        p_url: facts.url,
      })
      if (error) throw error
      setSent(true)
      // Tracked as well as stored, so the report appears in its own session's
      // timeline as an event too — the moment somebody gave up is worth
      // seeing in the sequence, not only in the inbox.
      track('problem_reported', { chars: said.trim().length })
    } catch {
      // Never a thrown error inside a bug reporter. Said out loud instead,
      // because a report that silently vanished is strictly worse than no
      // reporter at all: somebody who believes they have told you goes quiet.
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="swb-veil" onClick={onClose}>
      <div className="swb" onClick={(e) => e.stopPropagation()}>
        <div className="swb-grip" />
        <div className="swb-title">What went wrong?</div>

        {sent ? (
          <>
            <p className="swb-body">
              Thank you — that is genuinely useful. It came with the build, the screen you were on
              and everything you did before it, so nobody has to ask you any of that.
            </p>
            <button className="swb-send" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <p className="swb-body">
              {hint ??
                'Say it however you would say it out loud. “The button did nothing” is a good report.'}
            </p>
            <textarea
              className="swb-text"
              value={said}
              onChange={(e) => setSaid(e.target.value)}
              placeholder="I tapped Google Photos and it took me back to the same screen"
              rows={5}
              autoFocus
              maxLength={4000}
            />
            {/* Said plainly rather than hidden behind "diagnostics attached".
                Somebody typing into a box on a phone deserves to know what
                travels with it, and the list is short enough to print. */}
            <div className="swb-note">
              Sent with it: the build, your screen size, which tab you were on, and what you tapped
              in this session. No photographs, no trips, nothing you have written down.
            </div>
            {failed && (
              <div className="swb-note swb-note--bad">
                That didn’t send. Worth trying again — if it keeps failing, the network is likely
                the problem rather than you.
              </div>
            )}
            <button className={`swb-send${state.bad ? ' swb-send--retry' : ''}`} onClick={send} disabled={!state.can}>
              {state.label}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
