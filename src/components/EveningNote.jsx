import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../lib/AuthContext.jsx'
import { pushDiagnostics, registerPush } from '../lib/push.js'
import { oops, track } from '../lib/analytics.js'

// Asking for notifications at the moment there is something to notify about.
//
// David: "how can we ask them at 9pm if they havent enabled push??" Exactly
// right, and it was already half-solved — TrackPlaces asks for push straight
// after location, on the reasoning that the day builds itself from location
// and the only way anybody finds out it did is the nine o'clock look-back.
//
// The half that was missing is everybody who says "not this trip" to
// tracking. They were never asked at all, and they still qualify: the
// look-back needs five photographs OR two kilometres — see ENOUGH in
// dayLookBack.js — so a person who uploads a few pictures a day and declines
// location has a perfectly good evening note waiting for them and no way to
// receive it.
//
// So this asks on the other side of the same fork, after photographs have
// actually landed, which is the first moment the promise is demonstrably
// true rather than a description of one.
//
// ── What it will not do ───────────────────────────────────────────────────
//
// Nothing on the web, where the build never registers for push at all — the
// browser needs a service-worker subscription and VAPID keys, which is a
// different mechanism from FCM device tokens, and offering it here would be
// a button that does nothing.
//
// Nothing once the question has been answered, either way. A permission
// already granted needs no card, and one already refused is not somebody to
// ask again on the next screen; that is what Account is for.

export default function EveningNote() {
  const { user } = useContext(AuthContext)
  const [state, setState] = useState(null) // null = still looking
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    pushDiagnostics().then((d) => alive && setState(d))
    return () => {
      alive = false
    }
  }, [])

  // 'prompt' and 'prompt-with-rationale' are the two the system uses for
  // "never asked". Anything else — granted, denied, no plugin, not native —
  // means there is no question left to put to somebody here.
  const askable =
    state?.native &&
    (state.permission === 'prompt' || state.permission === 'prompt-with-rationale')

  if (!askable || !user?.email) return null

  async function ask() {
    setBusy(true)
    try {
      const out = await registerPush(user.email)
      track('evening_note_asked', { ok: Boolean(out?.ok), why: out?.reason ?? null })
    } catch (e) {
      // Quiet on purpose. The photographs are already up and the trip is
      // already made; a failed permission must not read as a failed upload.
      oops('push', e, 'EveningNote/ask')
    } finally {
      setState(await pushDiagnostics())
      setBusy(false)
    }
  }

  return (
    <div className="track-card compact">
      <div className="track-title">One thing at nine</div>
      <div className="track-body">
        Each evening, a look back at the day the app put together from what you added — where
        you got to, what you photographed, how far it was. One notification a day, and nothing
        else.
      </div>
      <button className="ios-sheet-done" onClick={ask} disabled={busy}>
        {busy ? 'one sec…' : 'Yes, tell me at nine'}
      </button>
    </div>
  )
}
