import { useMemo } from 'react'
import { ideasFor, seasonalNote } from '../../lib/planIdeas.js'

// The strip that fills the space under the last card.
//
// David: "still too much empty space here, especially beneath the third card
// … can we scroll ideas? E.g. 'how about a trip to Rome' 'why not pond hop to
// venice'? Images (drawings) that animate / scroll."
//
// Drawings rather than photographs, and that is not a shortcut. A photograph
// of the Colosseum on a suggestion card is a stock image and reads as an
// advert; a line in the app's own gold reads as the app talking. It is also
// the only version that works at 130px wide on a slow connection.
//
// ── On not overdoing it ───────────────────────────────────────────────────
//
// "But dont make it too much or too jarring." So: it drifts rather than
// slides — a full lap takes half a minute, which is nearer a clock hand than
// a carousel — and it stops the moment anybody touches it. Nothing fades,
// nothing pulses, and there is no dot row underneath announcing itself. The
// whole thing is one CSS translation on the compositor.

/**
 * Six drawings, shared between twelve places.
 *
 * Sharing is deliberate: an arch does for Marrakech, Samarkand and Petra, and
 * inventing three subtly different arches would be worse than honest reuse —
 * these are marks, not illustrations of a specific building.
 */
function Drawing({ art }) {
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
  return (
    <svg className="pi-art" viewBox="0 0 60 40" aria-hidden="true">
      <g {...stroke}>
        {art === 'colosseum' && (
          <>
            <path d="M8 34 V16 a22 12 0 0 1 44 0 V34 Z" />
            <path d="M8 25 H52" />
            <path d="M17 34 V25M30 34 V25M43 34 V25" />
            <path d="M17 25 V17M30 25 V15M43 25 V17" />
          </>
        )}
        {art === 'gondola' && (
          <>
            <path d="M6 30 q24 -16 48 0" />
            <path d="M6 30 q24 8 48 0" />
            <path d="M14 24 V10M46 24 V10" />
            <path d="M30 20 V6" />
          </>
        )}
        {art === 'tram' && (
          <>
            <rect x="12" y="12" width="36" height="18" rx="3" />
            <path d="M12 21 H48" />
            <circle cx="20" cy="33" r="3" />
            <circle cx="40" cy="33" r="3" />
            <path d="M30 12 V5" />
          </>
        )}
        {art === 'torii' && (
          <>
            <path d="M6 12 q24 -6 48 0" />
            <path d="M12 18 H48" />
            <path d="M18 12 V34M42 12 V34" />
          </>
        )}
        {art === 'peak' && (
          <>
            <path d="M4 32 L20 12 L30 24 L38 14 L56 32 Z" />
            <path d="M15 19 L20 16 L25 19" />
          </>
        )}
        {art === 'arch' && (
          <>
            <path d="M14 34 V20 a16 16 0 0 1 32 0 V34" />
            <path d="M24 34 V24 a6 6 0 0 1 12 0 V34" />
            <path d="M8 34 H52" />
          </>
        )}
        {art === 'temple' && (
          <>
            <path d="M10 20 L30 8 L50 20" />
            <path d="M14 20 V32M46 20 V32M30 20 V32" />
            <path d="M8 32 H52" />
          </>
        )}
        {art === 'ship' && (
          <>
            <path d="M10 28 h40 l-6 8 h-28 Z" />
            <path d="M30 28 V8 l14 8 l-14 5" />
            <path d="M6 34 q8 4 14 0 q8 4 14 0 q8 4 14 0" />
          </>
        )}
      </g>
    </svg>
  )
}

/**
 * @param flights  the reader's own legs, so "never been" is true of them
 * @param onPick   what to do when one is tapped — see the preview in the mock
 */
export default function PlanIdeas({ flights = [], onPick }) {
  const ideas = useMemo(() => ideasFor({ flights }), [flights])
  const note = useMemo(() => seasonalNote(), [])

  if (!ideas.length) return null

  return (
    <div className="plan-ideas">
      <p className="pi-label">Ideas</p>

      {/* Doubled, and the animation travels exactly half the width, so the
          second copy is where the first was when it restarts. Any other
          distance and the strip visibly jumps once a lap. */}
      <div className="pi-clip">
        <div className="pi-track">
          {[...ideas, ...ideas].map((idea, i) => (
            <button
              key={`${idea.id}-${i}`}
              className="pi-card"
              onClick={() => onPick?.(idea)}
              // The second copy is the same information twice. One set is
              // announced; the other is scenery.
              aria-hidden={i >= ideas.length}
              tabIndex={i >= ideas.length ? -1 : 0}
            >
              <Drawing art={idea.art} />
              <span className="pi-name">{idea.name}</span>
              <span className="pi-why">{idea.why}</span>
            </button>
          ))}
        </div>
      </div>

      {/* One sentence, no card around it. A third boxed thing on a screen that
          already has a lane and a strip is where "too much" starts. */}
      {note && <p className="pi-season">{note}</p>}
    </div>
  )
}
