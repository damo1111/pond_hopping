import { useEffect, useState } from 'react'
import TrackPlaces, { offersTracking } from './TrackPlaces.jsx'
import { tripStartingSoon, whenPhrase } from '../lib/goingSoon.js'
import { visitStatus } from '../lib/visits.js'

// "You're about to go somewhere. Shall I record it?"
//
// The offer existed already, but only at the end of creating a trip — which
// reaches the person who typed one in this afternoon and nobody else. Not a
// booking that arrived by email, not a trip made in March for a flight in
// August, not anyone who said "not now" the first time. David's aunt is
// about to travel with a trip already in the app, and nothing would ever
// have asked her.
//
// It matters more than most settings because it is the one that cannot be
// applied retrospectively. A photo can be imported next year; a walk you
// took on Tuesday is simply gone. So this asks in the ten days before, in
// the tab somebody about to travel is already looking at, and stops asking
// the moment it is answered.
export default function TripStarting({ trips = [] }) {
  const [status, setStatus] = useState(undefined)

  useEffect(() => {
    let alive = true
    visitStatus().then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [])

  if (!offersTracking()) return null // the web can't do this, so it doesn't offer
  if (status === undefined) return null // still asking the phone; don't flash a card
  // Already on, or turned off at the system level — either way this is not
  // the screen for it. Account keeps the permanent switch.
  if (status?.enabled || status?.authorization === 'denied' || status?.authorization === 'restricted')
    return null

  const soon = tripStartingSoon(trips)
  if (!soon) return null

  const when = whenPhrase(soon)

  return (
    <div className="going-soon">
      <div className="going-soon-line">
        {soon.underway ? (
          <>
            You&apos;re on <b>{soon.trip.title}</b> {when}.
          </>
        ) : (
          <>
            <b>{soon.trip.title}</b> starts {when}.
          </>
        )}{' '}
        This is the one thing that can&apos;t be added later.
      </div>
      <TrackPlaces compact />
    </div>
  )
}
