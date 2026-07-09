import { useMemo } from 'react'
import TailFin from './TailFin.jsx'

function mostCommon(list) {
  const counts = new Map()
  for (const x of list) counts.set(x, (counts.get(x) || 0) + 1)
  let best = null
  let bestN = 0
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  return best
}

// A little animated flight path under a trip's Flights section — the
// ordered airports it actually visited, with a plane (wearing that trip's
// most-flown airline's real tail livery) flying stop to stop. Replays
// every time the Flights tab mounts, same as FlapText.
export default function RouteStrip({ flights, color }) {
  const stops = useMemo(() => {
    const seq = []
    for (const f of flights) {
      if (seq[seq.length - 1] !== f.dep_airport) seq.push(f.dep_airport)
      seq.push(f.arr_airport)
    }
    return seq.filter((code, i) => code !== seq[i - 1])
  }, [flights])

  const mainAirline = useMemo(
    () => mostCommon(flights.map((f) => f.airline).filter(Boolean)),
    [flights]
  )

  if (stops.length < 2) return null

  return (
    <div className="route-strip" style={{ '--rs-color': color }}>
      <div className="route-strip-track">
        <div className="route-strip-line" />
        {stops.map((code, i) => (
          <div
            key={`${code}-${i}`}
            className="route-strip-stop"
            style={{ left: `${(i / (stops.length - 1)) * 100}%` }}
          >
            <span className="rs-dot" />
            <span className="rs-code">{code}</span>
          </div>
        ))}
        <div className="route-strip-plane">
          <TailFin airline={mainAirline} size={11} />
          <span className="rs-fuselage" />
        </div>
      </div>
    </div>
  )
}
