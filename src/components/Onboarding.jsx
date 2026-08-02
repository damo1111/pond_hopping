import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'

// First run, for someone who isn't David. The problem this solves isn't
// "explain the app" — it's that a travel log with nothing in it is
// worthless, and that's where every app like this loses people. So this is
// a cold-start flow, not a tour: three routes to a populated app, ranked by
// how little work they require, and whichever one fits you is the one you
// see first.
//
// Notably absent: a feature walkthrough. Nobody reads them.

const INBOX = 'bookings@mail.eend.app'

function Step({ children }) {
  return <div className="ob-step">{children}</div>
}

export default function Onboarding({ onDone }) {
  const { user, profile, refreshProfile } = useAuth()
  const [step, setStep] = useState(0)
  const [partner, setPartner] = useState('')
  const [shared, setShared] = useState(null) // trips already waiting for them
  const [token, setToken] = useState(null)
  const [copied, setCopied] = useState(null)
  const [saving, setSaving] = useState(false)

  // Is someone already sharing trips with them? If so that's the whole
  // onboarding — they land in a populated app having done nothing.
  useEffect(() => {
    if (!user?.email) return
    supabase
      .from('trips')
      .select('slug,title,start_date,end_date')
      .then(({ data }) => setShared(data ?? []))
    supabase.rpc('my_api_token').then(({ data }) => setToken(data ?? null))
  }, [user?.email])

  function copy(what, text) {
    navigator.clipboard?.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 1800)
  }

  async function finish() {
    setSaving(true)
    await supabase
      .from('profiles')
      .update({
        onboarded_at: new Date().toISOString(),
        partner_email: partner.trim().toLowerCase() || null,
      })
      .eq('id', user.id)
    // Recording the partner as a connection too, so the existing sharing
    // machinery sees them rather than this being a dead field on profiles.
    if (partner.trim()) {
      await supabase.from('connections').insert({
        user_id: user.id,
        invitee_email: partner.trim().toLowerCase(),
        role: 'travel_companion',
      })
    }
    await refreshProfile()
    setSaving(false)
    onDone?.()
  }

  const name = (profile?.display_name || user?.email || '').split('@')[0]
  const mcpUrl = token ? `https://pond.eend.app/api/mcp?key=${token}` : null

  return (
    <div className="ob-overlay">
      <div className="ob-sheet">
        <img className="ob-duck" src="/duck.png" alt="" />

        {step === 0 && (
          <Step>
            <div className="ob-title">Hello {name}</div>
            <div className="ob-body">
              Pond Hopping keeps every trip you've taken — flights, photos, the day-to-day — on one
              map, and helps you plan the next one.
            </div>
            <div className="ob-body">
              Two questions, then we'll fill it in for you. It shouldn't start empty.
            </div>
            <button className="ob-primary" onClick={() => setStep(1)}>
              Start
            </button>
          </Step>
        )}

        {step === 1 && (
          <Step>
            <div className="ob-title">Who do you travel with?</div>
            <div className="ob-body">
              Their email. If you forward them booking confirmations, that turns out to be the single
              best way to spot which trips were shared — so this one answer does a lot of work later.
            </div>
            <input
              className="account-input"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              placeholder="them@example.com"
              value={partner}
              onChange={(e) => setPartner(e.target.value)}
            />
            <button className="ob-primary" onClick={() => setStep(2)}>
              {partner.trim() ? 'Next' : 'I travel alone'}
            </button>
          </Step>
        )}

        {step === 2 && (
          <Step>
            <div className="ob-title">Let's not start empty</div>

            {shared?.length > 0 && (
              <div className="ob-route ob-route-ready">
                <div className="ob-route-title">✓ {shared.length} trips are already here</div>
                <div className="ob-route-body">
                  Someone's shared their travel with you — {shared
                    .slice(0, 3)
                    .map((t) => t.title)
                    .join(', ')}
                  {shared.length > 3 ? ` and ${shared.length - 3} more` : ''}. Nothing to do.
                </div>
              </div>
            )}

            <div className="ob-route">
              <div className="ob-route-title">📧 Forward your bookings</div>
              <div className="ob-route-body">
                Send any confirmation — flight, hotel, restaurant — to this address and it turns into
                an itinerary. Forward a few old ones and your history builds itself.
              </div>
              <button className="ob-secondary" onClick={() => copy('inbox', INBOX)}>
                {copied === 'inbox' ? 'Copied' : INBOX}
              </button>
            </div>

            {mcpUrl && (
              <div className="ob-route">
                <div className="ob-route-title">✨ Let your AI do it</div>
                <div className="ob-route-body">
                  Add Pond Hopping to Claude, ChatGPT or Gemini, then ask it:{' '}
                  <em>"go through my inbox and add my trips to Pond Hopping."</em> It already has your
                  email — we never need it.
                </div>
                <button className="ob-secondary" onClick={() => copy('mcp', mcpUrl)}>
                  {copied === 'mcp' ? 'Copied' : 'Copy connector URL'}
                </button>
              </div>
            )}

            <button className="ob-primary" onClick={finish} disabled={saving}>
              {saving ? 'One moment…' : shared?.length ? 'Show me' : 'Done'}
            </button>
            <button className="ob-skip" onClick={finish} disabled={saving}>
              I'll do this later
            </button>
          </Step>
        )}
      </div>
    </div>
  )
}
