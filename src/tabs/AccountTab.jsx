import { useContext, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase.js'
import { API_BASE } from '../lib/apiBase.js'
import { useAuth } from '../lib/AuthContext.jsx'
import {
  visitStatus,
  enableVisits,
  disableVisits,
  syncVisits,
  visitsNeedSettings,
  openLocationSettings,
  hasConsented,
  setConsent,
} from '../lib/visits.js'
import { recordingStatus } from '../lib/visitWindow.js'
import { isOn as gestureDebugOn, toggle as toggleGestureDebug } from '../lib/gestureDebug.js'
import { pushDiagnostics, registerPush } from '../lib/push.js'
import { TripContext } from '../App.jsx'
import { demoSwitchNote, hiddenByArrival } from '../lib/demoVisibility.js'
import { ownTrips } from '../lib/demoTour.js'

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
          Sent a code to <b>{email}</b> — enter it below (don't tap the link in the email, it'll open in
          the browser instead of here).
        </div>
        <input
          className="account-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="Code from the email"
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
      <div className="account-card-body">No password — we'll email you a code.</div>
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

// For a long time this sent nothing: the project had no mailer at all, so
// "Send invite" wrote a row and stopped, and the person on the other end
// found out by signing in with that address one day and noticing. Rather
// than let the button lie, it was made to say what it did — put them on the
// list, and hand you a sentence to send yourself.
//
// It now genuinely emails them, via /api/send-invite. The share sheet stays
// as the fallback rather than being deleted: sending can fail, the key can
// be missing, and "we didn't reach them, here are the words" is a better
// answer than a dead end. Which of the two happened is said out loud, since
// the difference decides whether you still owe them a message.
function InviteForm({ onInvited }) {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('family')
  const [sending, setSending] = useState(false)
  const [invited, setInvited] = useState(null)
  const [emailed, setEmailed] = useState(false)
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
    if (error) {
      setSending(false)
      setError(error.message)
      return
    }

    // The row is the thing that matters and it is already saved, so a failed
    // send costs the email and nothing else.
    let delivered = false
    try {
      const { data: s } = await supabase.auth.getSession()
      const res = await fetch(`${API_BASE}/api/send-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s?.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ email: who }),
      })
      delivered = res.ok
    } catch {
      /* offline, or the endpoint is down — the share sheet covers it */
    }

    setSending(false)
    setEmail('')
    setEmailed(delivered)
    setInvited(who)
    onInvited()
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
        <div className="account-card-title">{emailed ? 'Invited' : 'Now tell them'}</div>
        <div className="account-card-body">
          {emailed ? (
            <>
              <b>{invited}</b> is on the list and we've emailed them how to get in. Nothing else to do
              — though a word from you never hurts.
            </>
          ) : (
            <>
              <b>{invited}</b> is on the list, but the email didn't go out. Send them this and they're
              in.
            </>
          )}
        </div>
        <div className="invite-message">{message(invited)}</div>
        <button className={`account-btn${emailed ? ' ghost' : ''}`} onClick={share}>
          {copied ? 'Copied' : emailed ? 'Send it anyway' : 'Share this'}
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
        Adds them to your list so they can see what you've shared, and emails them how to get in.
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

// Which trips the whole app offers as its example. Only whoever runs the
// app sees this, and only they can change it — is_demo puts a trip on the
// globe of every visitor who has none of their own, so it is not a decision
// an owner makes about their own holiday. The database enforces that with a
// trigger; this is only the switch.
function ExamplesCard() {
  const [admin, setAdmin] = useState(false)
  const [busy, setBusy] = useState(null)
  const [rows, setRows] = useState([])

  useEffect(() => {
    supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true))
  }, [])

  // Read from trips rather than from the trip_meta the rest of the app uses,
  // because that view ends `where status = 'confirmed'` — so a trip still in
  // planning is not in it. Lisbon & Porto is exactly that: the example of
  // what a *planned* trip looks like, and the one trip this card could not
  // list or switch off. A picker that silently omits an option is worse than
  // no picker, since the thing you cannot see is the thing you cannot stop
  // showing to everybody.
  useEffect(() => {
    supabase
      .from('trips')
      .select('id,title,is_demo,status,start_date')
      .order('start_date', { ascending: true })
      .then(({ data }) =>
        setRows(
          (data ?? []).map((t) => ({
            id: t.id,
            title: t.title,
            is_demo: !!t.is_demo,
            status: t.status,
            when: t.start_date ? String(t.start_date).slice(0, 4) : 'no dates',
          }))
        )
      )
  }, [])

  if (!admin) return null

  async function toggle(row) {
    setBusy(row.id)
    const next = !row.is_demo
    const { error } = await supabase.from('trips').update({ is_demo: next }).eq('id', row.id)
    setBusy(null)
    if (error) return alert(`Couldn't change it: ${error.message}`)
    // Read back rather than assume: the trigger silently declines the change
    // for anybody who is not an admin, and a switch that lies about what
    // happened is worse than one that does nothing.
    const { data } = await supabase.from('trips').select('is_demo').eq('id', row.id).single()
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, is_demo: !!data?.is_demo } : r)))
  }

  const on = rows.filter((r) => r.is_demo).length

  return (
    <div className="account-card">
      <div className="account-card-title">Examples shown to everyone</div>
      <div className="account-card-body">
        These appear on the globe of anybody with no trips of their own, sashed as examples.
        {on === 0 && ' Nothing is set, so a new arrival meets an empty globe.'}
      </div>
      <div className="admin-examples">
        {rows.map((r) => (
          <button
            key={r.id}
            className={`admin-example${r.is_demo ? ' on' : ''}`}
            disabled={busy === r.id}
            onClick={() => toggle(r)}
          >
            <span className="admin-example-dot" />
            {/* Two rows read "Rome" and two read "China & Japan" — an
                example is a copy and carries the real trip's title. The dot
                says which is switched on; the year and the state say which
                row is which, so switching one off cannot mean the other. */}
            {r.title}
            <span className="admin-example-when">
              {r.when}
              {r.status === 'draft' ? ' · planning' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Opt-in background location. Renders nothing at all off iOS, and nothing on
// an iOS build that predates the plugin — visitStatus() returns null in both
// cases rather than offering a switch that can't be flipped.
function TimelineCard() {
  const { tripMeta } = useContext(TripContext)
  const [status, setStatus] = useState(undefined)
  const [consented, setConsented] = useState(() => hasConsented())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    visitStatus().then(setStatus)
  }, [])

  if (status === undefined || status === null) return null

  const blocked = status.authorization === 'denied' || status.authorization === 'restricted'
  const state = recordingStatus({ consented, trips: tripMeta })

  // Yes is a permission prompt and a start; no is a stop. In between, the
  // dates decide — which is the whole point of not having a stop button.
  async function toggle() {
    setBusy(true)
    try {
      if (consented) {
        setConsent(false)
        setConsented(false)
        await disableVisits()
      } else {
        setConsent(true)
        setConsented(true)
        const r = await enableVisits()
        if (r?.enabled === false && r?.authorization) {
          // Refused at the OS level — consent here means nothing without it.
          setConsent(false)
          setConsented(false)
        }
      }
      // Housekeeping, and not something to wait on: uploading whatever the
      // phone buffered has nothing to do with whether the switch has
      // flipped, and it is a network call that can stall on a bad line.
      syncVisits().catch(() => {})
    } finally {
      // Keep the status we had if the re-read comes back empty — undefined
      // would unmount the whole card, which is a worse answer than stale.
      const fresh = await visitStatus()
      if (fresh) setStatus(fresh)
      setBusy(false)
    }
  }

  return (
    <div className="account-card">
      <div className="account-card-title">Places on your trips</div>
      <div className="account-card-body">
        Notes where you stop, so each day of a trip gets its own map without you writing anything
        down. It runs on the days a trip covers and not otherwise — nothing to switch off. Yours
        alone: not people you share a trip with, not a shopfront link.
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
        <button className={`account-btn${consented ? ' ghost' : ''}`} onClick={toggle} disabled={busy}>
          {busy ? 'one sec…' : consented ? 'Stop logging places' : 'Log the places'}
        </button>
      )}

      <div className="account-hint">{state.note}</div>

      {consented && status.authorization === 'whenInUse' && (
        <div className="account-hint">
          {visitsNeedSettings() ? (
            <>
              Only while the app is open, for now.{' '}
              <button className="track-link" onClick={openLocationSettings}>
                Allow it all the time
              </button>{' '}
              and the days you never got round to opening it count too.
            </>
          ) : (
            <>
              Only while the app is open, for now — iOS offers to extend that on its own schedule
              once it has seen the app use it. Say yes when it asks.
            </>
          )}
        </div>
      )}

      {status.pending > 0 && <div className="account-hint">{status.pending} waiting to upload.</div>}
    </div>
  )
}

function DemoCard() {
  const { allTrips, demoPref, setDemoPref } = useContext(TripContext)
  const trips = allTrips ?? []
  if (!trips.some((t) => t.is_demo)) return null

  const real = ownTrips(trips).length
  const on = demoPref === 'show' || (demoPref === 'auto' && real === 0)

  return (
    <div className="account-card">
      <div className="account-card-title">The example trip</div>
      <div className="account-card-body">
        Hong Kong &amp; South Korea is a real log left here so the app has something to show before
        you've added anything. It isn't yours, and it can't be edited.
      </div>

      <button
        className={`account-btn${on ? ' ghost' : ''}`}
        onClick={() => setDemoPref?.(on ? 'hide' : 'show')}
      >
        {on ? 'Hide the example' : 'Show the example'}
      </button>

      <div className="account-hint">{demoSwitchNote({ trips, pref: demoPref })}</div>
      {hiddenByArrival({ trips, pref: demoPref }) && (
        <div className="account-hint">
          It went of its own accord when your first trip arrived — nothing was deleted.
        </div>
      )}
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

// Your own name, changeable. It used to be assumed from the email address —
// david2@ became "david2" — which is both wrong and the sort of thing that
// reads as the app knowing more about you than it does. Nothing sets it
// now except the person it belongs to.
function NameCard() {
  const { user, profile, refreshProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    await supabase.from('profiles').update({ display_name: name.trim() || null }).eq('id', user.id)
    await refreshProfile()
    setBusy(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <form className="account-card" onSubmit={save}>
        <div className="account-card-title">Your name</div>
        <div className="account-card-body">How you appear to anyone you share a trip with.</div>
        <input
          className="account-input"
          autoFocus
          maxLength={60}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="plan-form-actions">
          <button className="account-btn ghost" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button className="account-btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="account-card">
      <div className="account-card-title">{profile?.display_name || 'No name set'}</div>
      <div className="account-card-body">{user.email}</div>
      <div className="plan-form-actions">
        <button
          className="account-btn ghost"
          onClick={() => {
            setName(profile?.display_name || '')
            setEditing(true)
          }}
        >
          {profile?.display_name ? 'Change name' : 'Add your name'}
        </button>
        <button className="account-btn ghost" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
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
      <NameCard />

      <ConnectCard />

      <DemoCard />
      <ExamplesCard />
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
