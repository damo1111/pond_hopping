// The cold open.
//
// The last attempt at this was the globe: three seconds of WebGL, a hundred
// and fifty arcs mounting, on a phone. It looked right on a desktop and
// stuttered on the device, so it got turned off — which left the duck sitting
// still on a cream page, which is worse than either.
//
// This one is built to a budget instead. Everything here is SVG stroke and
// CSS transform: no canvas, no WebGL, no layout, nothing the compositor can't
// do on its own thread. A dozen paths and three circles is work an eight-year
// -old WebView can do at sixty frames a second, which is the only kind of
// motion worth shipping to a phone.
//
// What it says: a meridian sphere draws itself, a line crosses it, the duck
// lands at the far end, the water rings out, and the name resolves. Pond
// hopping — the thing the app is called, happening.
//
// ── Act two, and the card it replaced ─────────────────────────────────
//
// That was the whole of it for a while, and then a card came up afterwards
// explaining what the app was for: a stack of photographs, an arrow, and
// four lines of prose. It said the right thing in the wrong medium. Nobody
// arrives wanting to read, and a card asks to be read and then dismissed —
// so the first thing a new hopper did was dismiss the only explanation
// they were ever offered.
//
// So the sentence is acted out instead. Three photographs drop onto the
// globe, each folds down onto the place it was taken, a line joins them,
// and one line of copy says what just happened. Two seconds longer than
// the old opening, and it replaces a screen entirely — the first run gets
// shorter, not longer.
//
// It only ever runs once. `cold` is welded to the same first-run flag the
// rest of the opening is: five seconds is an opening on launch one and a
// toll booth on launch forty. Every later launch gets act one, cut short.
export default function BootScreen({ leaving, cold = false }) {
  return (
    <div className={`boot${leaving ? ' leaving' : ''}${cold ? ' boot--cold' : ''}`}>
      <div className="boot-stage">
        <svg className="boot-globe" viewBox="0 0 200 200" aria-hidden="true">
          {/* The sphere: an outline and four meridians, drawn on rather than
              faded in, so it reads as being made rather than revealed. */}
          <g className="bg-sphere" fill="none" strokeLinecap="round">
            <circle className="bg-line bg-l1" cx="100" cy="100" r="72" />
            <ellipse className="bg-line bg-l2" cx="100" cy="100" rx="30" ry="72" />
            <ellipse className="bg-line bg-l3" cx="100" cy="100" rx="58" ry="72" />
            <path className="bg-line bg-l4" d="M31 78 H169" />
            <path className="bg-line bg-l5" d="M31 122 H169" />
          </g>

          {/* The hop. A great circle drawn as one arc, dashed, so it reads as
              a route rather than as a line. */}
          <path
            className="boot-arc"
            d="M46 140 Q100 34 158 74"
            fill="none"
            strokeLinecap="round"
          />

          {/* Where it left. There is no pin at the other end — the duck is
              the marker, and a dot under it just looks like a smudge. */}
          <circle className="boot-pin boot-pin-a" cx="46" cy="140" r="3.5" />

          {/* The water rings out from under its feet, not from the middle of
              its body — 90 is the waterline the landing animation ends on.
              Three circles scaling from nothing: the cheapest possible ripple
              and, as it turns out, the right one. */}
          <g className="boot-rings" fill="none">
            <ellipse className="boot-ring boot-ring-1" cx="158" cy="90" rx="10" ry="3.4" />
            <ellipse className="boot-ring boot-ring-2" cx="158" cy="90" rx="10" ry="3.4" />
            <ellipse className="boot-ring boot-ring-3" cx="158" cy="90" rx="10" ry="3.4" />
          </g>

          {/* Act two. Three photographs, which become three pins and a route.
              Only rendered on the launch that earns it — an SVG group that is
              never animated is still a group the compositor carries.
              --tx/--ty is the vector from each photograph's own centre to its
              pin, which is only that simple because the group collapses about
              its own middle (transform-box: fill-box) rather than about the
              viewBox. */}
          {cold && (
            <g className="boot-second">
              <g className="boot-snap boot-snap-1" style={{ '--tx': '-25px', '--ty': '41px' }}>
                <rect className="boot-frame" x="62" y="66" width="34" height="26" rx="3" transform="rotate(-7 79 79)" />
                <circle className="boot-frame-in" cx="72" cy="75" r="3.5" transform="rotate(-7 79 79)" />
              </g>
              <g className="boot-snap boot-snap-2" style={{ '--tx': '1px', '--ty': '27px' }}>
                <rect className="boot-frame" x="82" y="76" width="34" height="26" rx="3" transform="rotate(3 99 89)" />
                <circle className="boot-frame-in" cx="92" cy="85" r="3.5" transform="rotate(3 99 89)" />
              </g>
              <g className="boot-snap boot-snap-3" style={{ '--tx': '19px', '--ty': '-1px' }}>
                <rect className="boot-frame" x="102" y="86" width="34" height="26" rx="3" transform="rotate(9 119 99)" />
                <circle className="boot-frame-in" cx="112" cy="95" r="3.5" transform="rotate(9 119 99)" />
              </g>

              {/* The route the pile turned out to be. It runs left to right
                  and finishes under the duck, so the trip the photographs
                  made and the hop the duck flew are the same journey. */}
              <path className="boot-track" d="M54 120 Q84 104 100 116 T138 98" fill="none" strokeLinecap="round" />
              <circle className="boot-made boot-made-1" cx="54" cy="120" r="3.4" />
              <circle className="boot-made boot-made-2" cx="100" cy="116" r="3.4" />
              <circle className="boot-made boot-made-3" cx="138" cy="98" r="3.4" />
            </g>
          )}
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

      {/* The whole pitch, in the one sentence that survived the card. Real
          text rather than a picture of text, so it is read out by anything
          reading the screen aloud and it wraps on a narrow phone. */}
      {cold && (
        <p className="boot-say">
          Your photos already know
          <br />
          where you went.
        </p>
      )}
    </div>
  )
}
