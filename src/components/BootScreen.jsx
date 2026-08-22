import ColdOpen from './ColdOpen.jsx'

// What is on screen while the app boots.
//
// Two different things, and which one you get is the whole design:
//
//   First launch on a device  →  ColdOpen.jsx. Ten seconds, the whole pitch.
//   Every launch after that   →  this file. Half a second: a sphere drawing
//                                itself, the duck landing, the name.
//
// Seven seconds is an opening on launch one and a toll booth on launch forty,
// so `cold` is welded to the same first-run flag the rest of the opening is.
//
// ── What used to be here, and why it went ─────────────────────────────────
//
// The cold path used to live in this file too: a real trip counting itself up
// — 16 days, 5 flights, 18,169km, China & Japan, 21 May – 5 Jun — ending on a
// card that flew to the same trip's card on Home. Every figure was true and
// checked against the database, which turned out to be beside the point. It
// was a trophy case for a holiday the person watching had not taken, and it
// never said what the app was for. David, testing it cold: "the dates, numbers
// are irrelevant to anyone but me."
//
// That took the card carry with it — there is no card to fly any more — and
// with it lib/landing.js, which existed for nothing else. The join is now the
// globe swelling to fill the frame, which is a better one than the carry was:
// Home *is* a big globe, so the cut is between two versions of one object, and
// it does not depend on a particular trip existing the way the carry did.
//
// ── The budget ────────────────────────────────────────────────────────────
//
// Everything below is SVG stroke and CSS transform: no canvas, no WebGL, no
// layout, nothing the compositor cannot do on its own thread. The attempt
// before this was three seconds of WebGL and a hundred and fifty arcs, which
// looked right on a desktop and stuttered on the device.

export default function BootScreen({ leaving, cold = false, onSkip }) {
  if (cold) return <ColdOpen leaving={leaving} onSkip={onSkip} />

  return (
    <div className={`boot${leaving ? ' leaving' : ''}`}>
      <div className="boot-stage">
        <svg className="boot-globe" viewBox="0 0 200 260" aria-hidden="true">
          {/* The sphere: an outline and four meridians, drawn on rather than
              faded in, so it reads as being made rather than revealed. */}
          <g className="bg-sphere" fill="none" strokeLinecap="round">
            <circle className="bg-line bg-l1" cx="100" cy="86" r="58" />
            <ellipse className="bg-line bg-l2" cx="100" cy="86" rx="24" ry="58" />
            <ellipse className="bg-line bg-l3" cx="100" cy="86" rx="45" ry="58" />
            <path className="bg-line bg-l4" d="M45 68 H155" />
            <path className="bg-line bg-l5" d="M45 104 H155" />
          </g>

          {/* The hop. A great circle drawn as one arc, dashed, so it reads as
              a route rather than as a line. */}
          <path className="boot-arc" d="M58 118 Q100 44 146 70" fill="none" strokeLinecap="round" />

          {/* Where it left. There is no pin at the other end — the duck is
              the marker, and a dot under it just looks like a smudge. */}
          <circle className="boot-pin-a" cx="58" cy="118" r="3.5" />

          {/* The water rings out from under its feet. 70 is the waterline the
              landing ends on — the duck sits at the arc's far end, not near
              it, which is the note that came back on the mock. */}
          <g className="boot-rings" fill="none">
            <ellipse className="boot-ring boot-ring-1" cx="146" cy="70" rx="10" ry="3.4" />
            <ellipse className="boot-ring boot-ring-2" cx="146" cy="70" rx="10" ry="3.4" />
            <ellipse className="boot-ring boot-ring-3" cx="146" cy="70" rx="10" ry="3.4" />
          </g>
        </svg>

        {/* The duck rides the arc. Keyframed translate rather than an
            offset-path: the motion is indistinguishable at this size and
            offset-path is the one thing here an older WebView might not have.
            Two elements because the flight and the bob are both transforms and
            one element can only hold one — the wrapper flies, the duck bobs. */}
        <span className="boot-duck-fly">
          <img className="boot-duck" src="/duck.png" alt="" />
        </span>
      </div>

      <div className="boot-title">
        <span className="app-title-thin">Pond</span>
        <span className="app-title-bold">Hopping</span>
      </div>
    </div>
  )
}
