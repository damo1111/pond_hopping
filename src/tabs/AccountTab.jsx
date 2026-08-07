import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'
import {
  visitStatus,
  enableVisits,
  disableVisits,
  syncVisits,
  visitsNeedSettings,
  openLocationSettings,
} from '../lib/visits.js'
import { isOn as gestureDebugOn, toggle as toggleGestureDebug } from '../lib/gestureDebug.js'
import { pushDiagnostics, registerPush } from '../lib/push.js'

const ROLES = [
  { id: 'family', label: 'Family' },
  { id: 'travel_companion', label: 'Travel companion' },
  { id: 'other', label: 'Other' },
]

// A clickable magic-link email opens in the system browser, not the
// installed PWA's own standalone window — and even where iOS routes it
// back, the session it creates there isn't reliably visible to the
// already-installed home-screen app (separate storage context). A typed
// code, verified in-place via verifyOtp, never leaves the PWA at all.
function SignInForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState(null)

  async function send(e) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({ email })
    setSending(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function verify(e) {
    e.preventDefault()
    setVerifying(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setVerifying(false)
    if (error) setError(error.message)
    // on success, AuthContext's onAuthStateChange picks up the new session automatically
  }

  if (sent) {
    return (
      <form className="account-card" onSubmit={verify}>
        <div className="account-card-title">Check your email</div>
        <div className="account-card-body">
          Sent a 6-digit code to <b>{email}</b> — enter it below (don't tap the link in the email, it'll open in
          the browser instead of here).
        </div>
        <input
          className="account-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="account-btn" type="submit" disabled={verifying}>
          {verifying ? 'Checking…' : 'Verify'}
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
    )
  }

  return (
    <form className="account-card" onSubmit={send}>
      <div className="account-card-title">Sign in</div>
      <div className="account-card-body">No password — we'll email you a 6-digit code.</div>
      <input
        className="account-input"
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="account-btn" type="submit" disabled={sending}>
        {sending ? 'Sending…' : 'Send code'}
      </button>
      {error && <div className="account-error">{error}</div>}
    </form>
  )
}

// This never sent an email. There is no mailer in the project at all — the
// only outbound anything is a push notification — so "Send invite" wrote a
// row and stopped, and the person on the other end was never told. They
// found out by signing in with that address one day and noticing.
//
// Rather than pretend, the button now says what it does: it puts them on
// the list, and hands you the sentence to send them yourself.
function InviteForm({ onInvited }) {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('family')
  const [sending, setSending] = useState(false)
  const [invited, setInvited] = useState(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)

  const message = (who) =>
    `I've added you to Pond Hopping, my travel log — open https://pond.eend.app and sign in with ${who}. It emails you a code, there's no password.`

  async function send(e) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const who = email.trim().toLowerCase()
    const { error } = await supabase
      .from('connections')
      .insert({ user_id: user.id, invitee_email: who, role })
    setSending(false)
    if (error) setError(error.message)
    else {
      setEmail('')
      setInvited(who)
      onInvited()
    }
  }

  async function share() {
    const text = message(invited)
    try {
      if (navigator.share) return await navigator.share({ text })
    } catch {
      /* dismissed the share sheet — fall through to copying */
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* a browser that won't copy still shows the text below */
    }
  }

  if (invited) {
    return (
      <div className="account-card">
        <div className="account-card-title">Now tell them</div>
        <div className="account-card-body">
          <b>{invited}</b> is on the list — but nothing has been emailed to them. Send them this and
          they're in.
        </div>
        <div className="invite-message">{message(invited)}</div>
        <button className="account-btn" onClick={share}>
          {copied ? 'Copied' : 'Share this'}
        </button>
        <button className="account-btn ghost" onClick={() => setInvited(null)}>
          Add someone else
        </button>
      </div>
    )
  }

  return (
    <form className="account-card" onSubmit={send}>
      <div className="account-card-title">Invite someone</div>
      <div className="account-card-body">
        Adds them to your list so they can see what you've shared. You send them the link yourself —
        nothing is emailed from here.
      </div>
      <input
        className="account-input"
        type="email"
        required
        placeholder="their@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <select className="account-input" value={role} onChange={(e) => setRole(e.target.value)}>
        {ROLES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <button className="account-btn" type="submit" disabled={sending}>
        {sending ? 'Adding…' : 'Add them'}
      </button>
      {error && <div className="account-error">{error}</div>}
    </form>
  )
}

function ConnectionRow({ c, myId, onChange }) {
  const iAmInviter = c.user_id === myId
  const otherLabel = iAmInviter
    ? c.connected_profile?.display_name || c.invitee_email || 'invited'
    : c.inviter_profile?.display_name || c.inviter_profile?.email || 'someone'

  async function respond(status) {
    await supabase.from('connections').update({ status }).eq('id', c.id)
    onChange()
  }
  async function remove() {
    await supabase.from('connections').delete().eq('id', c.id)
    onChange()
  }

  return (
    <div className="connection-row">
      <div className="connection-who">
        <span className="connection-name">{otherLabel}</span>
        <span className="connection-role">{ROLES.find((r) => r.id === c.role)?.label || c.role}</span>
      </div>
      {c.status === 'accepted' && <span className="connection-status accepted">✓ connected</span>}
      {c.status === 'pending' && iAmInviter && <span className="connection-status">waiting on them</span>}
      {c.status === 'pending' && !iAmInviter && (
        <div className="connection-actions">
          <button className="account-btn small" onClick={() => respond('accepted')}>
            Accept
          </button>
          <button className="account-btn small ghost" onClick={remove}>
            Decline
          </button>
        </div>
      )}
      {c.status === 'accepted' && (
        <button className="account-btn small ghost" onClick={remove}>
          Remove
        </button>
      )}
    </div>
  )
}

// Calendar apps and AI assistants can't sign in with a Supabase session,
// so they use an opaque per-person token instead. It's minted on first
// view (my_api_token creates one if none exists) rather than at signup, so
// nobody has a live credential they never asked for.
function ConnectCard() {
  const [token, setToken] = useState(null)
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    supabase.rpc('my_api_token').then(({ data }) => setToken(data ?? null))
  }, [])

  function copy(what, text) {
    navigator.clipboard?.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 1800)
  }

  if (!token) return null

  // webcal:// opens the calendar app with a subscribe prompt instead of
  // downloading a one-off .ics — on iOS and macOS, where something is
  // registered to handle the scheme. On Android nothing is: the tap goes
  // nowhere at all, no error, no chooser, which is exactly what it looked
  // like. Google Calendar's add-by-URL page is the Android equivalent, and
  // it takes the https form of the same feed.
  const feed = `pond.eend.app/api/calendar/${token}.ics`
  const android = Capacitor.getPlatform() === 'android' || /Android/i.test(navigator.userAgent || '')
  const calendar = android
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`https://${feed}`)}`
    : `webcal://${feed}`
  const mcp = `https://pond.eend.app/api/mcp?key=${token}`

  return (
    <div className="account-card">
      <div className="account-card-title">Connect</div>

      <div className="account-card-body">
        Subscribe to your trips in Apple, Google or Outlook Calendar. Updates itself as plans change.
      </div>
      <a className="account-btn" href={calendar} target={android ? '_blank' : undefined} rel="noreferrer">
        {android ? 'Add to Google Calendar' : 'Add to calendar'}
      </a>
      <button className="account-btn ghost" onClick={() => copy('cal', `https://${feed}`)}>
        {copied === 'cal' ? 'Copied' : 'Copy calendar link'}
      </button>

      <div className="account-card-body" style={{ marginTop: 14 }}>
        Connect Pond Hopping to Claude, ChatGPT or Gemini so your assistant can read your travel
        history — and add trips it finds in your inbox.
      </div>
      <button className="account-btn ghost" onClick={() => copy('mcp', mcp)}>
        {copied === 'mcp' ? 'Copied' : 'Copy AI connector URL'}
      </button>

      <div className="account-hint">Both links contain a private key — treat them like a password.</div>
    </div>
  )
}

// Opt-in background location. Renders nothing at all off iOS, and nothing on
// an iOS build that predates the plugin — visitStatus() returns null in both
// cases rather than offering a switch that can't be flipped.
function TimelineCard() {
  const [status, setStatus] = useState(undefined)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setStatus(await visitStatus())
  }

  useEffect(() => {
    refresh()
  }, [])

  if (status === undefined || status === null) return null

  async function toggle() {
    setBusy(true)
    try {
      if (status.enabled) await disableVisits()
      else await enableVisits()
      await syncVisits()
    } finally {
      await refresh()
      setBusy(false)
    }
  }

  const blocked = status.authorization === 'denied' || status.authorization === 'restricted'

  return (
    <div className="account-card">
      <div className="account-card-title">Travel timeline (beta)</div>
      <div className="account-card-body">
        Notes the places you stop and how long you stayed, so a trip fills in its own map without
        you logging anything. Nobody else can see it — not even people you've shared a trip with.
      </div>

      {blocked ? (
        <div className="account-hint">
          Location is switched off for Pond Hopping.{' '}
          {visitsNeedSettings() ? (
            <button className="track-link" onClick={openLocationSettings}>
              Turn it back on in Settings
            </button>
          ) : (
            <>Settings → Privacy &amp; Security → Location Services → Pond Hopping.</>
          )}
        </div>
      ) : (
        <button
          className={`account-btn${status.enabled ? ' ghost' : ''}`}
          onClick={toggle}
          disabled={busy}
        >
          {busy ? 'one sec…' : status.enabled ? 'Stop recording' : 'Start recording'}
        </button>
      )}

      {status.enabled && status.authorization === 'whenInUse' && (
        <div className="account-hint">
          {visitsNeedSettings() ? (
            <>
              Recording while the app is open.{' '}
              <button className="track-link" onClick={openLocationSettings}>
                Allow it all the time
              </button>{' '}
              and the days you never got round to opening it count too.
            </>
          ) : (
            <>
              Recording while the app is open. iOS offers to extend that to the background on its
              own schedule, once it's seen the app genuinely use it — say yes when it asks.
            </>
          )}
        </div>
      )}
      {status.pending > 0 && <div className="account-hint">{status.pending} waiting to upload.</div>}
    </div>
  )
}

// Push registration fails in four silent ways, on a device with no console.
// AuthContext calls registerPush on every signed-in launch and discards the
// answer, so an empty push_tokens table could mean the permission was
// refused, the plugin was missing, FCM never replied, or the row was
// rejected — and there was no way to tell which from the outside.
//
// This asks the same question by hand and prints the answer.
function PushCard() {
  const { user } = useAuth()
  const [info, setInfo] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    pushDiagnostics().then(setInfo)
  }, [])

  if (!info?.native) return null

  async function retry() {
    setBusy(true)
    setResult(null)
    try {
      // Who PostgREST thinks is asking. Tested directly with a proper JWT
      // for this user, the insert policy's predicate passes — so a refusal
      // means the request arrived without the session on it, and when no
      // policy applies to the role that is the exact message you get back.
      const { data: seen, error: seenErr } = await supabase
        .from('profiles')
        .select('id,email')
        .eq('id', user?.id)
        .maybeSingle()
      const { data: sess } = await supabase.auth.getSession()

      setResult({
        ...(await registerPush(user?.email)),
        serverSees: seenErr ? `error: ${seenErr.message}` : seen?.email || 'nobody',
        clientEmail: user?.email || 'none',
        hasToken: sess?.session?.access_token ? 'yes' : 'no',
      })
      setInfo(await pushDiagnostics())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account-card">
      <div className="account-card-title">Notifications</div>
      <div className="account-card-body">
        Told when a forwarded booking turns into an itinerary. Nothing else sends one.
      </div>

      <div className="push-rows">
        <div className="push-row">
          <span>Device</span>
          <b>{info.platform}</b>
        </div>
        <div className="push-row">
          <span>Permission</span>
          <b>{info.permission}</b>
        </div>
        {result && (
          <>
            <div className="push-row">
              <span>Last attempt</span>
              <b>{result.ok ? `registered · ${result.token}` : result.reason}</b>
            </div>
            <div className="push-row">
              <span>Signed in as</span>
              <b>{result.clientEmail}</b>
            </div>
            <div className="push-row">
              <span>Server sees</span>
              <b>{result.serverSees}</b>
            </div>
            <div className="push-row">
              <span>Access token</span>
              <b>{result.hasToken}</b>
            </div>
          </>
        )}
      </div>

      <button className="account-btn ghost" onClick={retry} disabled={busy}>
        {busy ? 'asking…' : 'Register this device'}
      </button>
    </div>
  )
}

function SignedIn() {
  const { user, profile } = useAuth()
  const [connections, setConnections] = useState(null)

  async function load() {
    const { data } = await supabase
      .from('connections')
      .select('*')
      .or(`user_id.eq.${user.id},connected_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
    const rows = data ?? []
    const otherIds = [
      ...new Set(rows.map((c) => (c.user_id === user.id ? c.connected_user_id : c.user_id)).filter(Boolean)),
    ]
    let profilesById = {}
    if (otherIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id,display_name,email').in('id', otherIds)
      profilesById = Object.fromEntries((profs ?? []).map((p) => [p.id, p]))
    }
    setConnections(
      rows.map((c) => ({
        ...c,
        connected_profile: c.connected_user_id ? profilesById[c.connected_user_id] : null,
        inviter_profile: c.user_id !== user.id ? profilesById[c.user_id] : null,
      }))
    )
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  return (
    <>
      <div className="account-card">
        <div className="account-card-title">{profile?.display_name || user.email}</div>
        <div className="account-card-body">{user.email}</div>
        <button className="account-btn ghost" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>

      <ConnectCard />

      <PushCard />
      <TimelineCard />

      <InviteForm onInvited={load} />

      {connections?.length > 0 && (
        <div className="account-card">
          <div className="account-card-title">Connections</div>
          {connections.map((c) => (
            <ConnectionRow key={c.id} c={c} myId={user.id} onChange={load} />
          ))}
        </div>
      )}
    </>
  )
}

// Which build this is. Tapping it makes the service worker go and look for a
// newer one — the fix for a phone that's been sitting on a cached bundle,
// and the thing that settles "is my fix even live yet?" in one glance.
function BuildStamp() {
  const [checking, setChecking] = useState(false)
  const [state, setState] = useState(null)

  async function check() {
    if (!('serviceWorker' in navigator)) return setState('no service worker here')
    setChecking(true)
    try {
      const reg = await navigator.serviceWorker.ready
      await reg.update()
      // A worker installing or waiting means an update is on its way in;
      // main.jsx's controllerchange listener handles the reload from there.
      setState(reg.installing || reg.waiting ? 'updating…' : 'already up to date')
    } catch {
      setState('couldn’t check')
    }
    setChecking(false)
  }

  return (
    <button className="build-stamp" onClick={check} disabled={checking}>
      build {__BUILD_ID__} · {__BUILT_AT__}
      {state ? ` — ${state}` : ' · tap to check for updates'}
    </button>
  )
}

// Turns on a readout inside the recap sheets showing which touch events the
// drag is actually receiving. It exists because the close gesture stayed
// broken on a real phone through three fixes that all passed on a desktop
// browser — the two engines disagree about what a downward drag produces and
// whether it can be cancelled, and only the phone can settle it.
function GestureDebugToggle() {
  const [on, setOn] = useState(() => gestureDebugOn())
  return (
    <button className="build-stamp" onClick={() => setOn(toggleGestureDebug())}>
      gesture readout · {on ? 'on — open a sheet and drag it' : 'off'}
    </button>
  )
}

export default function AccountTab() {
  const { user, authLoading } = useAuth()
  if (authLoading) return <div className="tab-loading">loading…</div>
  return (
    <div className="account-wrap">
      {user ? <SignedIn /> : <SignInForm />}
      <BuildStamp />
      <GestureDebugToggle />
    </div>
  )
}
