import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'

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

function InviteForm({ onInvited }) {
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('family')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  async function send(e) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const { error } = await supabase
      .from('connections')
      .insert({ user_id: user.id, invitee_email: email.trim().toLowerCase(), role })
    setSending(false)
    if (error) setError(error.message)
    else {
      setEmail('')
      onInvited()
    }
  }

  return (
    <form className="account-card" onSubmit={send}>
      <div className="account-card-title">Invite someone</div>
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
        {sending ? 'Sending…' : 'Send invite'}
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

export default function AccountTab() {
  const { user, authLoading } = useAuth()
  if (authLoading) return <div className="tab-loading">loading…</div>
  return <div className="account-wrap">{user ? <SignedIn /> : <SignInForm />}</div>
}
