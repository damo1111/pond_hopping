import { useEffect, useState } from 'react'
import { whereToComeBack } from '../lib/comeBackTo.js'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'
import SheetGrip from './SheetGrip.jsx'
import { track } from '../lib/analytics.js'
import { remember, waiting, forget, resendIn } from '../lib/pendingCode.js'
import { offerIn, rememberWayIn } from '../lib/waysIn.js'

/**
 * The provider's own mark, drawn rather than typed.
 *
 * These were a  and the letter G. The first is U+F8FF, a private-use
 * character that resolves to the Apple logo on Apple's own platforms and to
 * nothing anywhere else — so the Apple button showed an empty box on every
 * Android phone and every Windows desktop, which is exactly the audience
 * least likely to give it the benefit of the doubt. The second was a letter
 * in our own mono face, which is not Google's mark and does not meet their
 * branding guidelines.
 *
 * Inline SVG rather than image files: two marks at 18px are smaller than the
 * requests to fetch them, they cannot arrive late on a sheet somebody is
 * already looking at, and there is no font left to fall back from.
 *
 * Apple's is one path in `currentColor`, so it takes the button's own colour
 * and stays legible in both themes — which is what their guidelines ask for.
 * Google's is theirs exactly, four colours and all: it is a trademark, and
 * the permission to use it is a permission to use it unaltered.
 */
function WayMark({ id }) {
  if (id === 'apple') {
    return (
      <span className="way-mark" aria-hidden="true">
        <svg viewBox="0 0 842 1000" focusable="false">
          <path
            fill="currentColor"
            d="M702.4 544.2c-1.2-121 98.8-179.1 103.3-181.9-56.3-82.3-143.8-93.5-174.9-94.8-74.5-7.5-145.4 43.9-183.1 43.9-37.7 0-96-42.8-157.8-41.7-81.2 1.2-156.1 47.2-197.9 119.9-84.4 146.4-21.6 363.1 60.5 482 40.1 58.2 88 123.5 151.1 121.2 60.6-2.4 83.5-39.2 156.8-39.2s94 39.2 158.1 38c65.3-1.2 106.7-59.3 146.7-117.7 46.2-67.5 65.2-132.8 66.3-136.2-1.4-.7-127.2-48.9-128.5-193.9M583.1 180.8C616.5 140.3 639 84.2 632.9 28c-48.2 1.9-106.6 32.1-141.1 72.5-31 35.8-58.1 93-50.8 147.9 53.8 4.2 108.7-27.3 142.1-67.6"
          />
        </svg>
      </span>
    )
  }
  return (
    <span className="way-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </span>
  )
}

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

  // Anyone signed in without a name gets asked, however they got here.
  //
  // The question used to live only at the end of verify(), which is the
  // emailed-code path — so it could not be reached by somebody who came back
  // from Apple or Google, because that journey leaves the page entirely and
  // returns with a session already made. handle_new_user() now keeps whatever
  // name the provider handed over, which covers Google and covers Apple when
  // the name was not withheld; this catches the rest, including an Apple
  // hopper on a private relay address, whose email prefix is a random string.
  //
  // Waits for the row: `profile` is null while it loads, and null is not the
  // same as loaded-and-nameless.
  useEffect(() => {
    if (user && profile && !profile.display_name) setNaming(true)
  }, [user, profile])

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
      //
      // And inside the wrappers the origin is not the site at all: the assets
      // are bundled, so it is https://localhost. Sent that, Supabase fell
      // back to the Site URL exactly as above and left the session in Chrome
      // with the app still signed out. comeBackTo knows the difference.
      options: { redirectTo: await whereToComeBack() },
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
    setError(null)
    const address = email.trim()

    // Move to the code step now, ask Google's neighbour afterwards.
    //
    // This used to await signInWithOtp before changing anything, so the
    // sheet sat on the email field doing nothing visible for as long as the
    // round trip took — long enough to look stuck, and to tap again. The
    // request is not what somebody is waiting for; the code is, and the code
    // arrives by mail seconds later whatever this screen is showing.
    //
    // Written down before the step is shown, so closing the sheet on the very
    // next frame — which is what going to fetch the code amounts to — still
    // comes back here.
    remember(address)
    rememberWayIn('code')
    setSentAt(Date.now())
    setSent(true)

    const { error } = await supabase.auth.signInWithOtp({ email: address })
    // And back again if it never went. A code field waiting for a code that
    // was never sent is worse than the wait it replaced, so a refusal —
    // rate limit, malformed address, provider down — undoes the whole thing
    // rather than leaving somebody staring at six empty boxes.
    if (error) {
      forget()
      setSentAt(null)
      setSent(false)
      setError(error.message)
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
                      <WayMark id={w.id} />
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
