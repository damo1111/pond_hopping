import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { FORWARD_TO, addressesFor, forwardingOn, mailtoLink, withAddress } from '../../lib/forwarding.js'

// Forward the confirmation and be done with it.
//
// Offered above the paste box because it is less work: pasting means opening
// the email, selecting all of it, and getting it into a text field on a
// phone, which is three awkward operations. Forwarding is one tap in the app
// you are already in when the confirmation arrives.
//
// The one thing that has to be said out loud is which address to send from.
// The match is on the sender, so a forward from a work account lands under
// an address nobody owns and is never seen again — silently, with a push
// that never comes. Better to name the addresses that work and offer to add
// another than to let somebody discover that by losing a booking.
export default function ForwardBookings() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [copied, setCopied] = useState(false)
  const [adding, setAdding] = useState(false)
  const [typed, setTyped] = useState('')
  const [saving, setSaving] = useState(false)
  const [trouble, setTrouble] = useState(null)

  useEffect(() => {
    if (!user) return
    let alive = true
    supabase.from('profiles').select('email,email_aliases').maybeSingle()
      .then(({ data }) => alive && setProfile(data ?? {}))
    return () => {
      alive = false
    }
  }, [user])

  if (!forwardingOn() || !user) return null

  const from = addressesFor(profile ?? {}, user)

  async function copy() {
    try {
      await navigator.clipboard.writeText(FORWARD_TO)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* a phone that won't give us the clipboard still shows the address */
    }
  }

  async function addAddress() {
    const next = withAddress(profile ?? {}, user, typed)
    if (!next) {
      setTrouble(
        typed.trim() ? 'That one is already on your account, or it is not an address.' : null
      )
      return
    }
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ email_aliases: next }).eq('id', user.id)
    setSaving(false)
    if (error) {
      setTrouble(error.message)
      return
    }
    setProfile((p) => ({ ...(p ?? {}), email_aliases: next }))
    setTyped('')
    setAdding(false)
    setTrouble(null)
  }

  return (
    <div className="fwd">
      <div className="fwd-lead">Forward it instead</div>
      <button className="fwd-address" onClick={copy}>
        <span className="fwd-address-text">{FORWARD_TO}</span>
        <span className="fwd-copy">{copied ? 'copied ✓' : 'copy'}</span>
      </button>
      <a className="fwd-open" href={mailtoLink()}>
        open mail →
      </a>
      <div className="fwd-note">
        {from.length === 1 ? (
          <>
            Send it from <strong>{from[0]}</strong> — that is how it finds you. It works out which
            trip from the dates, and tells you when it has.
          </>
        ) : (
          <>
            Send it from any of <strong>{from.join(', ')}</strong>. It works out which trip from the
            dates, and tells you when it has.
          </>
        )}
      </div>
      {adding ? (
        <div className="fwd-add">
          <input
            className="account-input"
            placeholder="another address you send from"
            value={typed}
            autoFocus
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAddress()}
          />
          <div className="fwd-add-buttons">
            <button className="jf-save" disabled={saving || !typed.trim()} onClick={addAddress}>
              {saving ? 'saving…' : 'add it'}
            </button>
            <button className="jf-cancel" onClick={() => { setAdding(false); setTrouble(null) }}>
              cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="fwd-another" onClick={() => setAdding(true)}>
          I forward from another address
        </button>
      )}
      {trouble && <div className="fwd-trouble">{trouble}</div>}
    </div>
  )
}
