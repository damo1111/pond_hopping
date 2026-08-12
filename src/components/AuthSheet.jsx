import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'
import SheetGrip from './SheetGrip.jsx'
import { track } from '../lib/analytics.js'
import { remember, waiting, forget, resendIn } from '../lib/pendingCode.js'
import { offerIn, rememberWayIn } from '../lib/waysIn.js'

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
  // Both of these open on whatever was outstanding when the sheet last
  // closed. Reading it once at mount rather than watching it: the code step
  // is a place you are, not a thing that can change under you, and a hopper
  // typing a code should never have the box move because a stale write
  // arrived from somewhere else.
  const outstanding = useState(() => waiting())[0]
  const [email, setEmail] = useState(outstanding?.email ?? '')
  const [sent, setSent] = useState(!!outstanding)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // A third step, shown only to someone who has just made an account and has
  // no name on it. Everyone else goes straight through as before.
  // When the outstanding code went out, so the offer of another one can wait
  // the minute Supabase insists on — and so it survives leaving the app.
  const [sentAt, setSentAt] = useState(outstanding?.at ?? null)
  const [waitLeft, setWaitLeft] = useState(() => resendIn(outstanding?.at))
  useEffect(() => {
    if (!sentAt) return setWaitLeft(0)
    setWaitLeft(resendIn(sentAt))
    const t = setInterval(() => setWaitLeft(resendIn(sentAt)), 1000)
    return () => clearInterval(t)
  }, [sentAt])
  // Apple and Google, when this build has been told they exist. Empty by
  // default, so a project that has not had the providers set up shows the
  // sheet exactly as it always was rather than a button that answers
  // "Unsupported provider".
  const { ways, last } = useState(() => offerIn(import.meta.env.VITE_WAYS_IN))[0]
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  /**
   * Off to Apple or Google and back.
   *
   * Deliberately no scopes. connectGoogle() asks for Gmail and Calendar
   * because it is connecting an inbox; asking for either at the front door
   * puts a consent screen the size of a legal notice in front of somebody
   * who only wanted to sign in.
   */
  async function goVia(provider) {
    track('sign_in_provider', { provider })
    setBusy(true)
    setError(null)
    rememberWayIn(provider)
    const { error: no } = await supabase.auth.signInWithOAuth({
      provider,
      // The trailing slash is load-bearing. Supabase matches redirectTo
      // against the allow-list with globs in which `.` and `/` are both
      // separators, so the pattern its own docs recommend — `https://host/**`
      // — needs a `/` after the host, and `location.origin` has none. Sent
      // bare, the match fails, and rather than refusing, Supabase quietly
      // returns the person to the project's Site URL instead.
      //
      // Which is the worst shape a failure can have: sign-in genuinely
      // succeeded, the token comes back in the fragment, and the browser
      // lands somewhere the reader may not be able to reach at all — a
      // preview deployment, or a network where the production domain is
      // blocked. It reads as the app being broken.
      options: { redirectTo: `${window.location.origin}/` },
    })
    // On success the page has already gone. Only a refusal gets this far.
    if (no) {
      setBusy(false)
      setError(no.message)
    }
  }

  async function send(e) {
    track('sign_in_code_asked')
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
    setBusy(false)
    if (error) setError(error.message)
    else {
      // Written down before the step is shown, so closing the sheet on the
      // very next frame — which is what going to fetch the code amounts to —
      // still comes back here.
      remember(email.trim())
      rememberWayIn('code')
      setSentAt(Date.now())
      setSent(true)
    }
  }

  async function verify(e) {
    track('sign_in_code_entered')
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    // Used. Anything still written down is now a code that cannot work.
    forget()

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
    track('sign_in_named')
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
        <SheetGrip onClose={onClose} />

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
              Sent to <b>{email}</b>. <b>The code is in the subject line</b> — you don&apos;t have to
              open the email.
            </div>
            {/* Three true things, in the order they save time.

                The subject line first, because it is the one nobody knows and
                it changes what waiting feels like: a notification preview
                carries the whole code, so the mail never has to be opened —
                or, on a slow inbox, even delivered to the app you are looking
                at. Then where else to look. Then the warning about the link,
                which only matters once the email is open, so it goes last. */}
            <div className="auth-patience">
              Can take a minute, and sometimes lands in spam. Don&apos;t tap the link in it — that
              opens the browser instead of the app.
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
              disabled={busy || waitLeft > 0}
              onClick={async () => {
                // Missing until now, and the only thing to do when a code has
                // genuinely gone astray. Without it the way out of a lost code
                // was to change your email address, which is not a thing
                // anybody wants to do to receive a code.
                //
                // It waits a minute first. Sending another invalidates the one
                // already on its way, so an eager tap while the first is in
                // flight is how a slow code becomes a wrong code.
                setBusy(true)
                setError(null)
                const { error: again } = await supabase.auth.signInWithOtp({ email: email.trim() })
                setBusy(false)
                if (again) setError(again.message)
                else {
                  remember(email.trim())
                  setSentAt(Date.now())
                }
              }}
            >
              {waitLeft > 0 ? `Send it again in ${Math.ceil(waitLeft / 1000)}s` : 'Send it again'}
            </button>
            <button
              className="account-btn ghost"
              type="button"
              onClick={() => {
                forget()
                setSent(false)
                setSentAt(null)
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
              {ways.length
                ? 'Whichever is easiest. Your trips are private to you unless you choose to share them.'
                : "Same box for both — if we haven't seen your email before, this makes your account. No password: we email you a code. Your trips are private to you unless you choose to share them."}
            </div>

            {ways.length > 0 && (
              <>
                <div className="ways">
                  {ways.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className={`way way--${w.id}${w.id === last ? ' way--last' : ''}`}
                      disabled={busy}
                      onClick={() => goVia(w.id)}
                    >
                      <span className="way-mark" aria-hidden="true">{w.id === 'apple' ? '' : 'G'}</span>
                      <span>{w.label}</span>
                      {w.id === last && <span className="way-again">last time</span>}
                    </button>
                  ))}
                </div>
                {/* The code is not hidden behind "other options". It is the
                    only way in that works for somebody with neither account,
                    and it is what every existing hopper already has. */}
                <div className="ways-or">or a code by email</div>
              </>
            )}
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
