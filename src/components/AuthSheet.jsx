import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'

// The front door to the app's account, opened by tapping the duck.
// Same passwordless OTP flow the Account tab has always used (email →
// 6-digit code, verified in-place so it never leaves the installed PWA),
// just surfaced somewhere people will actually find it. Signed in, it's
// a quick who-am-I + sign-out; signed out, it's the two-step sign-in.
export default function AuthSheet({ onClose }) {
  const { user, profile } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

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
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError(error.message)
    else onClose() // AuthContext picks up the new session; close the sheet.
  }

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet auth-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ios-sheet-grip" />

        {user ? (
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
              Sent a 6-digit code to <b>{email}</b>. Type it in below — don't tap the link in the email, it opens the
              browser instead of the app.
            </div>
            <input
              className="account-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="123456"
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
            <div className="ios-sheet-title">Sign in to Pond Hopping</div>
            <div className="ios-sheet-sub">Private trips only show when you're signed in. No password — we email you a 6-digit code.</div>
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
