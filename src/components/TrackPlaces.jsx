import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext.jsx'
import { registerPush } from '../lib/push.js'
import {
  enableVisits,
  openLocationSettings,
  visitStatus,
  visitsNeedSettings,
  visitsSupported,
} from '../lib/visits.js'

// Asked at the only moment it makes sense: a trip has just been created, and
// the days it covers haven't happened yet.
//
// This used to live in Account, under a heading nobody reads, as a switch
// with nothing on the other side of it — you granted background location and
// then watched nothing happen, forever, because no screen in the app read
// `location_visits`. The day map reads it now, so saying yes visibly pays
// off, and the asking has moved to where the payoff is.
//
// Everything the system dialog cannot say gets said here first. Both phones
// give you one sentence and no second chance: a "no" is permanent until
// somebody finds their way into Settings. So the real question is asked in
// plain English, with the answer to "who can see this" given before it is
// wanted, and only then is the system prompt raised. What comes next differs
// by platform and is described accurately rather than generically — Android
// asks twice and sends you to a settings page for the second half, and being
// surprised by that is how people end up half-granted and confused.

/**
 * Whether this device has anything to say on the subject — checked before a
 * flow adds a step for it, so the web PWA never gains a "Trip created" screen
 * whose only content renders to nothing.
 */
export function offersTracking() {
  return visitsSupported()
}

export default function TrackPlaces({ compact = false, onDone }) {
  const { user } = useAuth()
  const email = user?.email
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

  // A browser tab that isn't open records nothing, on any platform, so the
  // web is offered nothing rather than a switch that quietly does very
  // little. Both apps can do this properly.
  if (!visitsSupported() || status === undefined || status === null) return null

  const android = visitsNeedSettings()

  if (status.enabled) {
    return (
      <div className="track-note">
        Places are being noted for this trip already. Each day's map fills itself in.
        {android && status.authorization === 'whenInUse' && (
          <>
            {' '}
            Only while the app is open, though —{' '}
            <button className="track-link" onClick={openLocationSettings}>
              allow it all the time
            </button>{' '}
            and the days you never got round to opening it count too.
          </>
        )}
      </div>
    )
  }

  if (status.authorization === 'denied' || status.authorization === 'restricted') {
    return (
      <div className="track-note">
        Location is switched off for Pond Hopping, so the days can't fill themselves in.{' '}
        {android ? (
          <button className="track-link" onClick={openLocationSettings}>
            Turn it back on in Settings
          </button>
        ) : (
          <>Settings → Privacy &amp; Security → Location Services → Pond Hopping.</>
        )}
      </div>
    )
  }

  async function turnOn() {
    setBusy(true)
    setAsked(true)
    try {
      await enableVisits()
      // The other half of the same offer.
      //
      // These were two separate asks and that was wrong in a way David caught
      // and I had not: the day builds itself from location, and the *only*
      // way anybody finds out it did is the nine o'clock look-back, which is
      // a push notification. Asking for push later means asking at nine — by
      // push — which cannot work. So the first evening, the best one anybody
      // ever gets, was silently lost to a chicken and egg.
      //
      // Deliberately after location and never instead of it: notifications
      // with nothing to notify about are the ask people refuse. Failure here
      // is quiet on purpose — it costs the look-back, not the tracking, and
      // there is a switch in Account either way.
      if (email) await registerPush(email)
    } finally {
      const fresh = await visitStatus()
      if (fresh) setStatus(fresh)
      setBusy(false)
      onDone?.()
    }
  }

  return (
    <div className={`track-card${compact ? ' compact' : ''}`}>
      <div className="track-title">Let the trip log itself</div>
      <div className="track-body">
        If you&apos;d like, the app can note the places you stop while you&apos;re away, so each day
        gets its own map without you logging anything — and tell you what it made of it at nine
        each evening.
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
          <b>Barely touches the battery.</b> No map open, no GPS running — the phone wakes the app
          a handful of times a day and that's the lot.
        </li>
        <li>
          <b>One thing at nine.</b> A look back at the day it put together, and nothing else. Not a
          notification every time you stop somewhere.
        </li>
        <li>
          <b>Off whenever.</b> One tap in Account, and both stop.
        </li>
      </ul>

      <div className="track-next">
        {android ? (
          <>
            Android will ask next, and it asks twice: location first, then <b>Allow all the time</b>{' '}
            on your app&apos;s settings page. The first one alone is enough to start — it records
            while the app is open, and you can come back for the second. Notifications are a third
            tap, and they are how the nine o&apos;clock look-back reaches you.
          </>
        ) : (
          <>
            iOS will ask next. <b>While Using the App</b> is enough to start — it offers to extend
            that later, once it&apos;s seen the app actually use it. It will ask about
            notifications too, which is how the nine o&apos;clock look-back reaches you.
          </>
        )}
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
