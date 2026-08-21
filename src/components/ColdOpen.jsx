import { useEffect, useMemo, useRef } from 'react'
import {
  GLOBE,
  HUB,
  LEGS,
  PILE,
  SPOKES,
  TARGETS,
  arcUp,
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

export default function ColdOpen({ leaving, onSkip }) {
  const yearEl = useRef(null)

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
              <ellipse className="co-wire" pathLength="1" cx={GLOBE.cx} cy={GLOBE.cy} rx="23" ry={GLOBE.r} />
              <ellipse className="co-wire" pathLength="1" cx={GLOBE.cx} cy={GLOBE.cy} rx="46" ry={GLOBE.r} />
              <path className="co-wire" pathLength="1" d="M84 130 H216" />
              <path className="co-wire" pathLength="1" d="M94 100 H206" />
              <path className="co-wire" pathLength="1" d="M94 160 H206" />
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

            {/* Flying the one arc that goes over the top, and landing on its
                far pin. Inside the group, so the swell carries him rather than
                leaving him hanging where the small globe used to be. */}
            <image className="co-duck" href="/duck.png" x="-13" y="-15" width="26" height="28" />
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
          <span className="co-swaps">
            <span className="co-swap" style={{ '--in': '3700ms', '--out': '5200ms' }}>
              a photo you already have
            </span>
            <span className="co-swap" style={{ '--in': '5200ms', '--out': '6700ms' }}>
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
