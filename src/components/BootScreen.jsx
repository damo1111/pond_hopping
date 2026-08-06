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
export default function BootScreen({ leaving }) {
  return (
    <div className={`boot${leaving ? ' leaving' : ''}`}>
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
