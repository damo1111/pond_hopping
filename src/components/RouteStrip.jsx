import { useMemo } from 'react'
import TailFin from './TailFin.jsx'
import { stripOf, atFraction } from '../lib/routeStrip.js'

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
export default function RouteStrip({ flights, color, showing = null, onPick }) {
  // Built in one pass so each flight knows which two dots it occupies. The
  // codes repeat — BKK twice on a Thailand trip — so looking one up cannot
  // say which is meant. See routeStrip.js.
  const { stops, legs } = useMemo(() => stripOf(flights), [flights])
  const lit = showing ? legs.get(showing) : null

  const mainAirline = useMemo(
    () => mostCommon(flights.map((f) => f.airline).filter(Boolean)),
    [flights]
  )

  if (stops.length < 2) return null

  return (
    <div className="route-strip" style={{ '--rs-color': color }}>
      <div className="route-strip-track">
        <div className="route-strip-line" />
        {/* The open flight, drawn on the line it belongs to. */}
        {lit && (
          <div
            className="route-strip-leg"
            style={{
              left: `${atFraction(lit[0], stops.length) * 100}%`,
              width: `${(atFraction(lit[1], stops.length) - atFraction(lit[0], stops.length)) * 100}%`,
            }}
          />
        )}
        {stops.map((code, i) => {
          const on = lit ? i >= lit[0] && i <= lit[1] : false
          return (
            <button
              type="button"
              key={`${code}-${i}`}
              className={`route-strip-stop${on ? ' on' : ''}`}
              style={{ left: `${atFraction(i, stops.length) * 100}%` }}
              onClick={() => onPick?.(i)}
            >
              <span className="rs-dot" />
              <span className="rs-code">{code}</span>
            </button>
          )
        })}
        <div className="route-strip-plane">
          <TailFin airline={mainAirline} size={11} />
          <span className="rs-fuselage" />
        </div>
      </div>
    </div>
  )
}
