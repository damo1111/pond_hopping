import { useContext, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase.js'
import { backfill } from '../lib/flightBackfill.js'
import { REACH, askAbout } from '../lib/flightEnrich.js'
import { AIRPORT_TZ } from '../lib/airportTz.js'
import { queued, sendOriginal } from '../lib/photoIngest.js'
import { summarise } from '../lib/originals.js'
import { callApi } from '../lib/apiBase.js'
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
import { whatIsMissing } from '../lib/buildFacts.js'
import SayWhatBroke from '../components/SayWhatBroke.jsx'
import TesterSessions from '../components/TesterSessions.jsx'
import { ownTrips } from '../lib/demoTour.js'
import { remember, waiting, forget, resendIn } from '../lib/pendingCode.js'
import { readAll, ENOUGH } from '../lib/kpis.js'

/** Which build this is. Declared here, above every use — it was below them,
 *  which is the same shape as the crash that shipped tonight. */
const thisBuild = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

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
// The same two-step flow as AuthSheet, and it forgets its second step the
// same way — so it remembers it the same way too, out of the same file. Two
// front doors that disagree about whether a code is outstanding is the
// original bug with an extra place to hit it.
function SignInForm() {
  const outstanding = useState(() => waiting())[0]
  const [email, setEmail] = useState(outstanding?.email ?? '')
  const [sent, setSent] = useState(!!outstanding)
  const [sentAt, setSentAt] = useState(outstanding?.at ?? null)
  const [waitLeft, setWaitLeft] = useState(() => resendIn(outstanding?.at))
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
    else {
      remember(email)
      setSentAt(Date.now())
      setSent(true)
    }
  }

  // Ticks only while a code is outstanding; see pendingCode.js for why the
  // offer of another one has to wait.
  useEffect(() => {
    if (!sentAt) return setWaitLeft(0)
    setWaitLeft(resendIn(sentAt))
    const t = setInterval(() => setWaitLeft(resendIn(sentAt)), 1000)
    return () => clearInterval(t)
  }, [sentAt])

  async function verify(e) {
    e.preventDefault()
    setVerifying(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setVerifying(false)
    if (error) setError(error.message)
    else forget()
    // on success, AuthContext's onAuthStateChange picks up the new session automatically
  }

  if (sent) {
    return (
      <form className="account-card" onSubmit={verify}>
        <div className="account-card-title">Check your email</div>
        <div className="account-card-body">
          Sent to <b>{email}</b>. The code is in the subject line — you don't have to open the email.
          Can take a minute, and sometimes lands in spam. Don't tap the link in it, that opens the
          browser instead of here.
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
          disabled={sending || waitLeft > 0}
          onClick={async () => {
            setSending(true)
            setError(null)
            const { error: again } = await supabase.auth.signInWithOtp({ email })
            setSending(false)
            if (again) setError(again.message)
            else {
              remember(email)
              setSentAt(Date.now())
            }
          }}
        >
          {sending ? 'Sending…' : waitLeft > 0 ? `Send it again in ${Math.ceil(waitLeft / 1000)}s` : 'Send it again'}
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
      const res = await callApi(`/api/send-invite`, {
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
          {copied ? 'Copied' : emailed ? 'Share this' : 'Send it anyway'}
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

// What is broken, for whoever runs the app.
//
// The app white-screened on every load for hours on 11 August and the way
// anybody found out was a screenshot. Faults are recorded now — but a table
// nobody opens is storage, not tracking, so here is the table, in the app,
// on the screen the owner already visits.
//
// Grouped by build on purpose. "Something is broken" and "something broke in
// the deploy an hour ago" are different sentences, and only the second one
// tells you what to do about it.
function BrokenCard() {
  const [admin, setAdmin] = useState(false)
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true))
    // what_is_broken() refuses anybody who is not an admin and hands back no
    // rows, so nothing can leak through here. That is not the same as the
    // card being invisible, which is what the check below is for.
    supabase.rpc('what_is_broken', { p_since: '14 days' }).then(({ data }) => setRows(data ?? []))
  }, [])

  // Two mistakes were in the first version of this line and the second one
  // shipped.
  //
  // The function refusing a non-admin means they get zero rows, not that
  // they get no card — so without the `admin` check every Pond Hopper saw a
  // developer's panel telling them nothing was broken. And the guard meant
  // to prevent exactly that, `rows.length === 0 && !thisBuild`, could never
  // fire: `thisBuild` is a build id or the string 'dev', always truthy, so
  // `!thisBuild` is always false.
  //
  // It now also appears only when there is something to say. A card that is
  // always there becomes furniture and stops being read; one that turns up
  // only when something has broken is a signal by itself.
  if (!admin || !rows?.length) return null

  return (
    <section className="account-card">
      <div className="account-card-title">What is broken</div>
      <ul className="broken-list">
          {rows.map((r, i) => (
            <li key={i} className={`broken${r.build === thisBuild ? ' broken--now' : ''}`}>
              <button className="broken-head" onClick={() => setOpen(open === i ? null : i)}>
                <span className="broken-kind">{r.kind}</span>
                <span className="broken-what">{r.message}</span>
                <span className="broken-count">
                  {r.people} {r.people === 1 ? 'person' : 'people'} · {r.times}×
                </span>
              </button>
              {open === i && (
                <div className="broken-more">
                  <div className="broken-when">
                    build {r.build ?? 'unknown'} · first {whenish(r.first_at)} · last{' '}
                    {whenish(r.last_at)}
                  </div>
                  {r.where_at && <pre className="broken-where">{r.where_at}</pre>}
                  {r.stack && <pre className="broken-stack">{r.stack}</pre>}
                </div>
              )}
            </li>
        ))}
      </ul>
    </section>
  )
}


function whenish(iso) {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

// The product numbers, out of the events that were already being written.
//
// app_events had been collecting for months and nothing had ever read it —
// so the app could say what had broken and could not say whether anybody was
// using it, whether they got anywhere, or whether the thing they came for
// worked. David, 12 August: bounce as an experiment metric can wait, "but
// measuring bounce and product KPIs is" essential.
//
// Admin only, like BrokenCard: how_are_we_doing() refuses anybody else and
// returns no rows, which is indistinguishable from a quiet week — so the
// card checks separately before deciding to exist at all.
function NumbersCard() {
  const [admin, setAdmin] = useState(false)
  const [days, setDays] = useState(28)
  const [rows, setRows] = useState(null)

  useEffect(() => {
    supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true))
  }, [])

  useEffect(() => {
    if (!admin) return
    setRows(null)
    supabase.rpc('how_are_we_doing', { p_days: days }).then(({ data }) => setRows(data ?? []))
  }, [admin, days])

  if (!admin) return null

  const read = readAll(rows ?? [])

  return (
    <section className="account-card">
      <div className="account-card-title">How are we doing</div>
      <div className="kpi-span">
        {[7, 28, 90].map((n) => (
          <button
            key={n}
            className={`kpi-span-chip${days === n ? ' active' : ''}`}
            onClick={() => setDays(n)}
          >
            {n} days
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="account-card-body">Counting…</div>
      ) : (
        <ul className="kpi-list">
          {read.map((m) => (
            <li key={m.key} className="kpi">
              <span className="kpi-what">{m.label}</span>
              <span className="kpi-num">
                {/* The count is always shown. The rate is shown only when
                    there is enough underneath it to mean anything — see
                    kpis.js. "1 of 1" is not a 100% activation rate, and it
                    is exactly the number a dashboard would shout about. */}
                <b>{m.enough && m.percent ? m.percent : m.n.toLocaleString('en-GB')}</b>
                {m.of ? (
                  <span className="kpi-of">
                    {m.enough ? `${m.n} of ${m.d}` : `${m.n} of ${m.d} — too few to call`}
                  </span>
                ) : null}
              </span>
              <span className={`kpi-moved${m.better === true ? ' up' : m.better === false ? ' down' : ''}`}>
                {m.moved == null ? '' : `${m.moved > 0 ? '+' : ''}${m.moved}${m.of ? 'pp' : '%'}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="account-card-body kpi-note">
        Against the {days} days before. A rate is only stated once there are at
        least {ENOUGH} behind it.
      </div>
    </section>
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

// Watching the opening again.
//
// It plays once per device and then never again, which is right — two and a
// half seconds is an opening on launch one and a toll booth on launch forty.
// But "never again" turned out to include the case that matters most.
//
// Android installs a build over the top of the last one and the WebView
// keeps its storage, so a genuinely new build opens straight onto the app
// with no opening at all. That is the flag working exactly as designed, and
// it is also precisely what a broken animation looks like from the outside.
// It was reported as one.
//
// And the ordinary reason: the pitch lives inside the opening now — there is
// no card after it any more — so handing somebody your phone to show them
// what this is had no route back to the one screen that explains it.
// The way in, for everybody.
//
// Not admin-gated and not hidden behind a debug menu: the whole point is
// that a tester who has just hit something can say so while they still
// remember what they were doing. It sits on Account because that is the one
// screen every tester finds, and the crash screen offers the same sheet for
// the case where Account is not reachable at all.
// Whose app this is, and how to reach the people who made it.
//
// There was nothing. No name behind the duck, no version, no way to say
// something without finding whoever handed you the link. That is fine while
// every tester is somebody you know; it is not fine the moment one of them
// shows it to somebody you don't, which is the entire point of giving it to
// them.
//
// Deliberately last on the screen and deliberately quiet — a colophon, not a
// marketing panel. What it has to carry is small: who, how to say something,
// and which build, because the build is the first thing anybody will be
// asked for.
function AboutCard() {
  const missingFromBuild = whatIsMissing(import.meta.env)
  return (
    <div className="account-card account-card--about">
      <div className="about-mark">
        <img src="/duck.png" alt="" className="about-duck" />
        <div>
          <div className="about-name">Pond Hopping</div>
          <div className="about-by">
            by <span className="about-eend">.eend</span>
          </div>
        </div>
      </div>
      <div className="account-card-body">
        A travel log that fills itself in — from your photographs, your
        boarding passes and where you actually went.
      </div>
      <div className="about-links">
        <a className="about-link" href="mailto:hello@eend.app?subject=Pond%20Hopping">
          hello@eend.app
        </a>
        <span className="about-build">
          build {thisBuild}
          {/* Two bundles from the same commit differ if they were built on
              machines with different environments — which is exactly what
              happens here, since the web and the wrapper are built from one
              repository by two CI systems that share no configuration. Every
              iOS build shipped without Apple or Google sign-in and the build
              id could not have told anybody. */}
          {missingFromBuild && <span className="about-lacking">{missingFromBuild}</span>}
        </span>
      </div>
    </div>
  )
}


function SomethingWrongCard() {
  const [open, setOpen] = useState(false)
  return (
    <div className="account-card">
      <div className="account-card-title">Something not right?</div>
      <div className="account-card-body">
        Tell us in your own words. It goes with the build you are on, the screen you were looking
        at and what you tapped before it — so you are never asked any of that.
      </div>
      <button className="account-btn ghost" onClick={() => setOpen(true)}>
        Report a problem
      </button>
      <SayWhatBroke open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

// Admin only. Replaying the cold open is for whoever is checking it still
// lands right, not something a hopper has a reason to reach for.
function OpeningCard() {
  const { replayColdOpen } = useContext(TripContext)
  const [admin, setAdmin] = useState(false)

  useEffect(() => {
    supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true))
  }, [])

  if (!replayColdOpen || !admin) return null
  return (
    <div className="account-card">
      <div className="account-card-title">The opening</div>
      <div className="account-card-body">
        The globe drawing itself, the route crossing it, and a year of photographs folding into one
        trip. It plays once on a new device, so it stays an opening rather than a toll gate.
      </div>
      <button className="account-btn ghost" onClick={replayColdOpen}>
        Play it again
      </button>
      <div className="account-hint">
        Starts now and lands on the globe, and it will play once more the next time this app is
        opened cold — so it is still there on a phone you hand to somebody.
      </div>
    </div>
  )
}

function DemoCard() {
  const { allTrips, demoPref, setDemoPref } = useContext(TripContext)
  const trips = allTrips ?? []
  const examples = trips.filter((t) => t.is_demo)
  if (!examples.length) return null

  const real = ownTrips(trips).length
  const on = demoPref === 'show' || (demoPref === 'auto' && real === 0)
  const plural = examples.length > 1
  const names = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(
    examples.map((t) => t.title)
  )

  return (
    <div className="account-card">
      <div className="account-card-title">The example trip{plural ? 's' : ''}</div>
      <div className="account-card-body">
        {names} {plural ? 'are real logs' : 'is a real log'} left here so the app has something to
        show before you've added anything. {plural ? "They aren't yours, and they can't" : "It isn't yours, and it can't"} be edited.
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
// Originals waiting on this phone.
//
// Only ever shown when there are some, because a card explaining a feature
// nobody used is clutter — and hidden when there are none is also the
// honest signal that nothing is at risk.
//
// The count matters more than it looks. These bytes live in IndexedDB,
// which iOS can evict under storage pressure, so "23 originals held" is a
// promise the phone might not keep. Saying so out loud is what makes it
// possible to act before it does.
function OriginalsCard() {
  const [rows, setRows] = useState([])
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(0)
  const [failed, setFailed] = useState(0)

  const refresh = () => queued().then(setRows)
  useEffect(() => {
    refresh()
  }, [])

  const { count, label } = summarise(rows)
  if (!count && !done) return null

  async function send() {
    setSending(true)
    setDone(0)
    setFailed(0)
    // One at a time on purpose: these are the big ones, and a truthful
    // running count is worth more than finishing a few seconds sooner.
    for (const row of await queued()) {
      try {
        await sendOriginal(row)
        setDone((n) => n + 1)
      } catch {
        // Left in the queue, so trying again picks it up. Uploading is
        // upsert, so a retry overwrites rather than piling up copies.
        setFailed((n) => n + 1)
      }
      await refresh()
    }
    setSending(false)
  }

  return (
    <div className="account-card">
      <div className="account-card-title">Originals on this phone</div>
      <div className="account-card-body">
        {count
          ? `${label}, waiting. The app already uploaded shrunk copies — these are the full-size files, kept here until you send them. Best done on wi-fi.`
          : 'All sent.'}
        {failed > 0 && ` ${failed} didn't go — they're still here, try again.`}
      </div>
      {count > 0 && (
        <button className="account-btn" disabled={sending} onClick={send}>
          {sending ? `Sending… ${done} done` : `Send ${count === 1 ? 'it' : 'them'}`}
        </button>
      )}
    </div>
  )
}

// Does the flight source answer, and how far back?
//
// The whole flight-enrichment decision turns on one question — whether a
// free tier can look up a flight from two years ago or only one from last
// week — and the answer is one request away. This asks it with the oldest
// flight on the account and the newest, and shows exactly what came back.
//
// `?peek=1` writes nothing. Nothing here changes a single row: it is a
// question put to an API, and the answer printed.
function FlightSourceCard() {
  const { user } = useAuth()
  const [admin, setAdmin] = useState(false)
  // Which source is being asked, rather than merely whether one is.
  const [busy, setBusy] = useState(null)
  const [said, setSaid] = useState(null)
  const [filling, setFilling] = useState(false)
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true))
  }, [])

  /** Every flight the source can see, one at a time, once ever. */
  async function fill() {
    setFilling(true)
    setProgress('looking at what needs asking about…')
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token
      const { data: flights } = await supabase
        .from('flights')
        .select('*')
        .not('flight_number', 'is', null)
        .is('enriched_at', null)
        .order('dep_time', { ascending: false })

      // The date a flight source wants is the local one at the departure
      // airport, never the UTC one — see askAbout(). Seventeen flights were
      // enriched from the wrong day before this.
      const dayFor = (f) => askAbout(f.dep_time, AIRPORT_TZ[f.dep_airport])

      const tally = await backfill(flights ?? [], {
        ask: async (f) => {
          const r = await callApi('/api/enrich-flight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              number: f.flight_number,
              on: dayFor(f),
              from: f.dep_airport,
            }),
          })
          return { ok: r.ok, answer: await r.json().catch(() => ({})) }
        },
        save: async (id, patch) => {
          if (!Object.keys(patch).length) return
          await supabase.from('flights').update(patch).eq('id', id)
        },
        onStep: (t, f) =>
          setProgress(
            `${t.done} of ${t.total} · ${t.filled} filled in · ${t.nothing} not on record` +
              `${t.failed ? ` · ${t.failed} to try again` : ''} — ${f.flight_number}`
          ),
        // This source cannot see past a year, and it says so rather than
        // answering. Asking anyway spent 185 requests on refusals and wrote
        // every one of them down as "no record", which retired those flights
        // from the next source too.
        reach: REACH.aerodatabox,
      })

      // What this source was never going to be able to answer. Said out
      // loud, because "105 of 482" reads as a failure and "105 of 113, and
      // 369 are older than this source can see" reads as what happened.
      const outOfReach = (flights?.length ?? 0) - tally.total

      setProgress(
        tally.total === 0
          ? outOfReach
            ? `Nothing left to ask this source. ${outOfReach} flights are older than it can see — they are still waiting for one that reaches further back.`
            : 'Nothing left to ask about.'
          : `Done. ${tally.filled} of ${tally.total} filled in, ${tally.nothing} not on record` +
            `${tally.failed ? `, ${tally.failed} to try again` : ''}` +
            `${tally.disagreed ? `, ${tally.disagreed} disagreed with what you had` : ''}.` +
            `${outOfReach ? ` ${outOfReach} more are older than this source can see and were left alone.` : ''}`
      )
    } catch (e) {
      setProgress(`Stopped: ${e.message}. Nothing already filled in is lost — run it again.`)
    } finally {
      setFilling(false)
    }
  }

  /** @param who  which adapter to ask — they answer in the same shape, and
   *              the whole point of the peek is to see whether they really
   *              do before four hundred flights depend on it. */
  async function look(who = 'aerodatabox') {
    setBusy(who)
    setSaid(null)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token
      // The oldest and the newest flown flight with a number: the two that
      // bracket how far back this source can see.
      const { data: flights } = await supabase
        .from('flights')
        .select('flight_number,dep_airport,dep_time')
        .not('flight_number', 'is', null)
        .lt('dep_time', new Date().toISOString())
        .order('dep_time', { ascending: true })
      const list = flights ?? []
      const pick = [list[0], list[list.length - 1]].filter(Boolean)
      if (!pick.length) {
        setSaid('No flights with a number to ask about yet.')
        return
      }

      const out = []
      // One at a time, with a breath between them. The BASIC tier limits by
      // the second, so two requests fired back to back answered the first
      // and returned 429 to the second — which reads as "this flight is not
      // available" when it means "you asked too quickly". Any backfill over
      // hundreds of flights has to be paced the same way.
      const breathe = () => new Promise((r) => setTimeout(r, 1400))
      let first = true
      for (const f of pick) {
        if (!first) await breathe()
        first = false
        const on = askAbout(f.dep_time, AIRPORT_TZ[f.dep_airport])
        const where = who === 'cirium' ? '/api/enrich-flight-cirium' : '/api/enrich-flight'
        const r = await fetch(`${where}?peek=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ number: f.flight_number, on, from: f.dep_airport }),
        })
        const body = await r.text()
        out.push(`── ${f.flight_number} · ${on} · from ${f.dep_airport} · HTTP ${r.status}\n${body.slice(0, 3000)}`)
      }
      setSaid(out.join('\n\n'))
    } catch (e) {
      setSaid(`Could not ask: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  if (!user || !admin) return null

  return (
    <div className="account-card">
      <div className="account-card-title">Flight data</div>
      <div className="account-card-body">
        Asks the flight source about your oldest flight and your newest, and shows what comes back.
        Nothing is saved — this only asks.
      </div>
      <button className="account-btn" disabled={!!busy} onClick={() => look('aerodatabox')}>
        {busy === 'aerodatabox' ? 'asking…' : 'Ask AeroDataBox about two flights'}
      </button>

      {/* Cirium has not been confirmed against a real answer yet. Its
          historical lookup is a different path from its ordinary one and the
          adapter tries both, reporting which answered — so this button is
          how the mapping stops being a recollection and becomes a fact.
          Point it at the oldest flight on record: October 2009 is the thing
          no other source can reach and the only reason to pay for this one. */}
      <button className="account-btn" disabled={!!busy} onClick={() => look('cirium')}>
        {busy === 'cirium' ? 'asking…' : 'Ask Cirium about two flights'}
      </button>
      {said && <pre className="account-peek">{said}</pre>}

      {/* And the whole lot. Paced, resumable, and asked once ever: a flight
          that has been asked about carries enriched_at, so closing this
          costs the one in flight and nothing else. */}
      <button className="account-btn ghost" disabled={filling} onClick={fill}>
        {filling ? 'filling in…' : 'Fill in every flight it can see'}
      </button>
      {progress && <div className="account-progress">{progress}</div>}
    </div>
  )
}

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
// Degrees.
//
// "Follow this device" is the answer for almost everybody and is what nobody
// has to choose — it reads the browser's locale, and the test is for the
// handful of places that use Fahrenheit rather than against a list of the
// many that do not. The other two are here because somebody who has moved
// countries usually still thinks in the scale they grew up with.
function DegreesCard() {
  const { user, profile, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const now = profile?.temp_unit || 'device'

  async function choose(unit) {
    if (busy || unit === now) return
    setBusy(true)
    await supabase
      .from('profiles')
      .update({ temp_unit: unit === 'device' ? null : unit })
      .eq('id', user.id)
    await refreshProfile()
    setBusy(false)
  }

  if (!user) return null

  return (
    <div className="account-card">
      <div className="account-card-title">Temperature</div>
      <div className="account-card-body">
        Shown against each day of a trip, and averaged on its front page.
      </div>
      <div className="degrees-row">
        {[
          ['device', 'This device'],
          ['c', '°C'],
          ['f', '°F'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`ph-flag${now === id ? ' on' : ''}`}
            disabled={busy}
            onClick={() => choose(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

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
      <div className="account-group">You</div>
      <NameCard />
      <DegreesCard />

      <div className="account-group">Your trips</div>
      <ConnectCard />

      <DemoCard />
      <OpeningCard />

      <div className="account-group">Help</div>
      <SomethingWrongCard />
      <AboutCard />

      {/* Everything a hopper never needs to look at.
          Nineteen cards had accumulated on one screen — diagnostics,
          one-off imports, upload queues — each of them added for a reason
          and none of them ever taken away, so the settings a person actually
          changes were buried among tools for somebody who built the thing.
          Folded rather than deleted: they are still the fastest route to an
          answer when something is wrong, which is exactly when nobody wants
          to go and find them. */}
      <details className="account-more">
        <summary className="account-group account-group--fold">Under the bonnet</summary>
        <TesterSessions />
        <BrokenCard />
        <NumbersCard />
        <ExamplesCard />
        <OriginalsCard />
        <PushCard />
      </details>
      <FlightSourceCard />
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
