import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'

// The front door to the app's account, opened by tapping the duck.
// Same passwordless OTP flow the Account tab has always used (email →
// emailed code, verified in-place so it never leaves the installed PWA),
// just surfaced somewhere people will actually find it. Signed in, it's
// a quick who-am-I + sign-out; signed out, it's the two-step sign-in.
//
// The copy deliberately never says how many digits. That length is a
// Supabase setting (Auth → Sign In / Providers → Email OTP Length), not
// something this screen controls, and it was set to eight while every
// label here promised six — so the app was telling people the wrong
// number and then accepting what they typed anyway. Saying "a code"
// cannot go stale.
//
// It is also the sign-*up*, and always has been: signInWithOtp creates the
// user when the address is new. Nothing said so, which meant a stranger
// looking at the demo had no visible way in — the heading offered to sign
// them in to an account they had no idea they could make.
export default function AuthSheet({ onClose }) {
  const { user, profile, refreshProfile } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // A third step, shown only to someone who has just made an account and has
  // no name on it. Everyone else goes straight through as before.
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  async function send(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function verify(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }

    // Ask a brand-new account what it is called, rather than deciding for it.
    // Read the row rather than trusting `profile` from context, which is a
    // step behind at this moment — the session has only just been created.
    const { data: prof } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', data?.user?.id)
      .maybeSingle()
    setBusy(false)
    if (prof?.display_name) onClose() // AuthContext picks up the new session.
    else setNaming(true)
  }

  async function saveName(e) {
    e.preventDefault()
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', u?.user?.id)
    if (!error) await refreshProfile()
    setBusy(false)
    if (error) setError(error.message)
    else onClose()
  }

  // Above the other sheets rather than level with them. Sign-in is the one
  // sheet opened *from* another — "Create an account" sits inside "Get your
  // trips in" — and every overlay shared a z-index, so the one that painted
  // on top was whichever mounted later in the DOM. That was the routes
  // sheet, so sign-in opened underneath it and the tap looked like it did
  // nothing at all. Staying on top also leaves the sheet you came from open
  // behind, so signing in puts you back where you were.
  return (
    <div className="ios-sheet-overlay ios-sheet-overlay--auth" onClick={onClose}>
      <div className="ios-sheet auth-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ios-sheet-grip" />

        {/* Ahead of the signed-in branch deliberately: by the time this shows,
            AuthContext already has a session, and without this the sheet would
            skip straight past the question to "you're signed in". */}
        {naming ? (
          <form onSubmit={saveName}>
            <div className="ios-sheet-title">What should we call you?</div>
            <div className="ios-sheet-sub">
              It's how you'll appear to anyone you share a trip with. Your email stays private to them.
            </div>
            <input
              className="account-input"
              autoFocus
              required
              maxLength={60}
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="ios-sheet-done" type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'That’s me'}
            </button>
            {error && <div className="account-error">{error}</div>}
          </form>
        ) : user ? (
          <>
            <div className="auth-who">
              <div className="auth-avatar">{(profile?.display_name || user.email || '?')[0].toUpperCase()}</div>
              <div>
                <div className="ios-sheet-title" style={{ marginBottom: 2 }}>{profile?.display_name || 'Signed in'}</div>
                <div className="ios-sheet-sub" style={{ margin: 0 }}>{user.email}</div>
              </div>
            </div>
            <button
              className="account-btn ghost"
              onClick={async () => {
                await supabase.auth.signOut()
                onClose()
              }}
            >
              Sign out
            </button>
          </>
        ) : sent ? (
          <form onSubmit={verify}>
            <div className="ios-sheet-title">Check your email</div>
            <div className="ios-sheet-sub">
              Sent a code to <b>{email}</b>. Type it in below — don't tap the link in the email, it opens the
              browser instead of the app.
            </div>
            <input
              className="account-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="Code from the email"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="ios-sheet-done" type="submit" disabled={busy || !code.trim()}>
              {busy ? 'Checking…' : 'Verify & sign in'}
            </button>
            <button
              className="account-btn ghost"
              type="button"
              onClick={() => {
                setSent(false)
                setCode('')
                setError(null)
              }}
            >
              Use a different email
            </button>
            {error && <div className="account-error">{error}</div>}
          </form>
        ) : (
          <form onSubmit={send}>
            <div className="ios-sheet-title">Sign in or create an account</div>
            <div className="ios-sheet-sub">
              Same box for both — if we haven't seen your email before, this makes your account.
              No password: we email you a code. Your trips are private to you unless you
              choose to share them.
            </div>
            <input
              className="account-input"
              type="email"
              autoFocus
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="ios-sheet-done" type="submit" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
            {error && <div className="account-error">{error}</div>}
          </form>
        )}
      </div>
    </div>
  )
}
