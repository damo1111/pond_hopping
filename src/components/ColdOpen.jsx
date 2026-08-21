import { useEffect, useMemo, useRef } from 'react'
import {
  GLOBE,
  HUB,
  LEGS,
  JOURNEY_FROM,
  JOURNEY_MS,
  MERIDIANS,
  PILE,
  SPOKES,
  TARGETS,
  TURN_MS,
  arcUp,
  droppings,
  duckFrames,
  regrow,
} from '../lib/coldOpen.js'

// What somebody sees in the first ten seconds, once, ever.
//
// The one before this counted a real trip up — 16 days, 5 flights, 18,169km,
// China & Japan, 21 May – 5 Jun. Every figure was true and checked against the
// database, and that was the problem: it was a trophy case for a holiday the
// person watching did not take. David, testing it cold: "the dates, numbers are
// irrelevant to anyone but me... it needs to explain in a matter of seconds what
// the app does."
//
// So nothing here is anybody's trip. No dates, no distances, no place names, no
// flags. What it argues instead is the one genuinely remarkable thing this app
// can say — that the raw material is already on your phone and you do not have
// to make anything:
//
//     Every trip you've ever taken
//     and it all starts with … a photo you already have
//                            … a walk your phone remembers
//                            … a booking in your inbox
//
// One sentence, split across the sequence. Neither half of it is a product name:
// "Google Timeline" is a feature, "a walk your phone remembers" is the thing the
// feature is about, and only one of those means anything to somebody who has had
// the app for four seconds.
//
// ── Why it ends on the globe ──────────────────────────────────────────────
//
// The previous opening handed over by flying its trip card to the same trip's
// card on Home — genuinely lovely, and impossible here, because there is no card
// any more. The globe swelling to fill the frame is the replacement, and it is a
// better join than the card ever was: Home *is* a big globe, so the cut is
// between two versions of one object rather than between two screens. It also
// does not depend on a particular trip existing, which the card carry did.
//
// ── Skipping ──────────────────────────────────────────────────────────────
//
// Nine and a half seconds is a long time to hold somebody who has just installed
// something. It plays once per device and it is the whole pitch, so it earns the
// length — but not the right to trap anyone in it. A tap anywhere ends it.

/** Which tint each chip in the heap gets. Photographs, and three bits of paper. */
const TINTS = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 }

/**
 * What he leaves behind him, drawn rather than lettered.
 *
 * Deliberately not emoji: this plays before a font can be relied on and an
 * emoji is a font — the same reason the old opening drew its flags by hand.
 * Small, because these are footsteps: fifteen of them cross the globe, and at
 * badge size that is not a trail, it is a rash.
 */
function Dropped({ kind }) {
  if (kind === 'photo')
    // Solid with the picture knocked out of it, rather than an outlined box
    // with a line inside. Outlined, at nine pixels, it was indistinguishable
    // from the envelope two legs later — checked side by side, and they were
    // the same mark twice. Solid also rhymes with the heap of photographs this
    // opened on, which is what they are.
    return (
      <>
        <rect className="co-drop-solid" x="-4.6" y="-3.6" width="9.2" height="7.2" rx="1.4" />
        <circle className="co-drop-knock" cx="-2.1" cy="-1.3" r="1" />
        <path className="co-drop-knock" d="M-4.6 3.6 L-1.2 0 L1.6 2.2 L3 1 L4.6 3.6 Z" />
      </>
    )
  if (kind === 'step')
    // One foot, not a pair — he is leaving them one at a time, and the caller
    // alternates which side each lands on.
    return (
      <>
        <ellipse className="co-drop-fill" cx="0" cy="0.6" rx="2" ry="3.1" />
        <ellipse className="co-drop-fill" cx="0.4" cy="-3.6" rx="1.4" ry="1.1" />
      </>
    )
  // mail — a booking sitting in an inbox
  return (
    <>
      <rect className="co-drop-box" x="-4.8" y="-3.4" width="9.6" height="6.8" rx="1.2" />
      <path className="co-drop-line" d="M-4.8 -2.6 L0 0.8 L4.8 -2.6" />
    </>
  )
}

export default function ColdOpen({ leaving, onSkip }) {
  const yearEl = useRef(null)
  const duckEl = useRef(null)

  // The duck's whole journey — the long hop, then out to each thing as it is
  // named — driven from JS rather than the stylesheet.
  //
  // Web Animations rather than CSS keyframes because the alternative is thirty
  // hand-computed coordinates living in globals.css, and those quietly stopped
  // agreeing with this file the first time the globe was resized. One source of
  // geometry or none.
  //
  // Where element.animate is missing the stylesheet has already put him on the
  // last pin, so the screen is right and simply does not move — which is the
  // same thing reduced motion gets, and a better failure than a duck stuck in
  // the top-left corner.
  useEffect(() => {
    const el = duckEl.current
    if (!el?.animate) return undefined
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (still) return undefined
    const run = el.animate(duckFrames(), {
      duration: JOURNEY_MS,
      delay: JOURNEY_FROM,
      easing: 'linear',
      fill: 'both',
    })
    return () => run.cancel()
  }, [])

  // The count-up, the one thing on this screen CSS cannot do.
  //
  // Reduced motion gets the finished figure immediately rather than nothing:
  // somebody who has asked for less movement should still be told the claim.
  useEffect(() => {
    const el = yearEl.current
    if (!el) return undefined
    const FROM = 2009
    const TO = 2026
    const AT = 1900
    const OVER = 1200

    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (still) {
      el.textContent = String(TO)
      return undefined
    }

    const began = performance.now()
    let frame = requestAnimationFrame(function tick() {
      const gone = performance.now() - began
      const part = Math.max(0, Math.min(1, (gone - AT) / OVER))
      el.textContent = String(Math.round(FROM + (TO - FROM) * (1 - (1 - part) ** 2)))
      if (part < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const legs = useMemo(() => LEGS.map(([a, b]) => arcUp(a, b)), [])
  const drops = useMemo(() => droppings(), [])
  const pins = useMemo(() => [[HUB, 3.6], ...SPOKES.map((s) => [s, 2.8])], [])
  const chips = useMemo(
    () =>
      PILE.map(([sx, sy, sr, px, py, pr, kind], i) => {
        const [tx, ty] = TARGETS[i % TARGETS.length]
        const [ax, ay] = regrow([sx, sy])
        const [bx, by] = regrow([px, py])
        return { i, kind, sr, pr, ax, ay, bx, by, tx, ty }
      }),
    []
  )

  return (
    <div
      className={`co${leaving ? ' leaving' : ''}`}
      onPointerDown={onSkip}
      // Not a button, because it is the whole screen and a screen-sized button
      // is announced as one. It is a way past something, which is what a skip
      // control is, and the label says so.
      role="button"
      tabIndex={0}
      aria-label="Skip the introduction"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSkip?.()
      }}
    >
      <div className="co-stage">
        <svg className="co-draw" viewBox="0 0 300 350" aria-hidden="true">
          {/* One group, because the swell at the end moves all of it together —
              wireframe, routes, pins and duck — rather than the lines growing
              out from under a duck that stayed put. */}
          <g className="co-globe">
            <g>
              <circle className="co-wire" pathLength="1" cx={GLOBE.cx} cy={GLOBE.cy} r={GLOBE.r} />
              <path className="co-wire" pathLength="1" d="M64 138 H236" />
              <path className="co-wire" pathLength="1" d="M78 100 H222" />
              <path className="co-wire" pathLength="1" d="M78 176 H222" />
            </g>

            {/* The turn. Each meridian is a full-width ellipse squashed in x by
                the cosine of where it currently is, which is not an impression
                of rotation — it is the orthographic projection of one. Evenly
                spaced by starting each a quarter-turn further through the same
                loop. They fade rather than draw on, because a dash pattern on
                something being scaled does not stay put. */}
            <g className="co-turn">
              {Array.from({ length: MERIDIANS }, (_, i) => (
                <ellipse
                  key={i}
                  className="co-meridian"
                  cx={GLOBE.cx}
                  cy={GLOBE.cy}
                  rx={GLOBE.r}
                  ry={GLOBE.r}
                  style={{ '--phase': `${-(TURN_MS / MERIDIANS) * i}ms` }}
                />
              ))}
            </g>

            <g>
              {legs.map((d, i) => (
                <path key={d} className="co-arc" pathLength="1" d={d} style={{ '--d': `${2300 + i * 160}ms` }} />
              ))}
            </g>

            <g>
              {pins.map(([[x, y], r], i) => (
                <circle key={`${x}-${y}`} className="co-pin" cx={x} cy={y} r={r} style={{ '--d': `${2000 + i * 70}ms` }} />
              ))}
            </g>

            {/* What he leaves behind him — see droppings(). Each one lands as
                he passes it, so the trail writes itself under the words that
                name it rather than arriving as three finished badges. */}
            <g>
              {drops.map((d, i) => (
                <g key={`${d.kind}-${i}`} transform={`translate(${d.at[0]} ${d.at[1]})`}>
                  <g
                    className="co-drop"
                    style={{ '--d': `${d.when}ms`, '--tilt': `${d.flip ? 13 : -11}deg` }}
                  >
                    <Dropped kind={d.kind} />
                  </g>
                </g>
              ))}
            </g>

            {/* Flying the one arc that goes over the top, and landing on its
                far pin. Inside the group, so the swell carries him rather than
                leaving him hanging where the small globe used to be. */}
            <image ref={duckEl} className="co-duck" href="/duck.png" x="-16" y="-18" width="32" height="34" />
          </g>
        </svg>

        {chips.map((c) => (
          <span
            key={c.i}
            className={`co-chip co-chip--${c.kind === 'paper' ? 'paper' : TINTS[c.kind]}`}
            style={{
              '--sx': `${c.ax}px`,
              '--sy': `${c.ay}px`,
              '--sr': `${c.sr}deg`,
              '--px': `${c.bx}px`,
              '--py': `${c.by}px`,
              '--pr': `${c.pr}deg`,
              '--tx': `${c.tx}px`,
              '--ty': `${c.ty}px`,
              '--d': `${c.i * 52}ms`,
            }}
          />
        ))}

        <div className="co-year" ref={yearEl}>
          2009
        </div>

        <div className="co-open">Every trip you&apos;ve ever taken</div>

        <div className="co-rest">
          <span className="co-stem">and it all starts with</span>
          {/* Each leaves 250ms before the next arrives. Fading one out as the
              other faded in put both at full strength for a third of a second,
              which reads as a double exposure rather than a change of line. */}
          <span className="co-swaps">
            <span className="co-swap" style={{ '--in': '3700ms', '--out': '4950ms' }}>
              a photo you already have
            </span>
            <span className="co-swap" style={{ '--in': '5200ms', '--out': '6450ms' }}>
              a walk your phone remembers
            </span>
            <span className="co-swap co-swap--last" style={{ '--in': '6700ms' }}>
              a booking in your inbox
            </span>
          </span>
        </div>

        <div className="co-mark">
          <span className="app-title-thin">Pond</span> <span className="app-title-bold">Hopping</span>
        </div>
      </div>
    </div>
  )
}
