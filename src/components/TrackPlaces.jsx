import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { enableVisits, visitStatus, visitsSupported } from '../lib/visits.js'

// Asked at the only moment it makes sense: a trip has just been created, and
// the days it covers haven't happened yet.
//
// This used to live in Account, under a heading nobody reads, as a switch
// with nothing on the other side of it — you granted background location and
// then watched nothing happen, forever, because no screen in the app read
// `location_visits`. The day map reads it now, so saying yes visibly pays
// off, and the asking has moved to where the payoff is.
//
// Everything the system dialog cannot say gets said here first. iOS gives you
// one sentence and no second chance: a "no" is permanent until somebody finds
// their way into Settings. So the real question is asked in plain English,
// with the answer to "who can see this" given before it is wanted, and only
// then is the system prompt raised.

/**
 * Whether this device has anything to say on the subject — checked before a
 * flow adds a step for it, so the web PWA never gains a "Trip created" screen
 * whose only content renders to nothing.
 */
export function offersTracking() {
  return visitsSupported() || Capacitor.isNativePlatform()
}

export default function TrackPlaces({ compact = false, onDone }) {
  const [status, setStatus] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = useState(false)

  useEffect(() => {
    let alive = true
    visitStatus().then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [])

  // Nowhere this can work, so nothing is promised. Android's background
  // location is a different API with a Play Console declaration behind it,
  // and Safari has no background geolocation at all — but a phone that can't
  // record can still bring its Google Timeline in afterwards, which is worth
  // one line rather than silence.
  if (!visitsSupported()) {
    if (!Capacitor.isNativePlatform()) return null
    return (
      <div className="track-note">
        Recording places as you go is on the iPhone app for now. On this phone, bring your Google
        Timeline in when you get back — it's the same map, after the fact.
      </div>
    )
  }

  if (status === undefined || status === null) return null

  if (status.enabled) {
    return (
      <div className="track-note">
        Places are being noted for this trip already. Each day's map fills itself in.
      </div>
    )
  }

  if (status.authorization === 'denied' || status.authorization === 'restricted') {
    return (
      <div className="track-note">
        Location is switched off for Pond Hopping, so the days can't fill themselves in. Settings →
        Privacy &amp; Security → Location Services → Pond Hopping.
      </div>
    )
  }

  async function turnOn() {
    setBusy(true)
    setAsked(true)
    try {
      await enableVisits()
    } finally {
      setStatus(await visitStatus())
      setBusy(false)
      onDone?.()
    }
  }

  return (
    <div className={`track-card${compact ? ' compact' : ''}`}>
      <div className="track-title">Let the trip fill itself in</div>
      <div className="track-body">
        If you'd like, the app can note the places you stop while you're away, so each day gets its
        own map without you logging anything.
      </div>

      <ul className="track-points">
        <li>
          <b>Places, not a trail.</b> Your phone tells the app when you've settled somewhere and
          when you left. It isn't following you between them.
        </li>
        <li>
          <b>Nobody else sees it.</b> Not people you share a trip with, not a shopfront link. Yours
          alone, and deletable.
        </li>
        <li>
          <b>Barely touches the battery.</b> No map open, no GPS running — iOS wakes the app a
          handful of times a day.
        </li>
        <li>
          <b>Off whenever.</b> One tap in Account, and it stops.
        </li>
      </ul>

      <div className="track-next">
        iOS will ask next. <b>While Using the App</b> is enough to start — it offers to extend that
        later, once it's seen the app actually use it.
      </div>

      <button className="ios-sheet-done" onClick={turnOn} disabled={busy}>
        {busy ? 'one sec…' : 'Yes, note where I go'}
      </button>
      {!asked && (
        <button className="account-btn ghost" onClick={() => onDone?.()}>
          Not this trip
        </button>
      )}
    </div>
  )
}
