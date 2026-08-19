// The one thing that never moves.
//
// The app was four pages that replaced one another, so every tab change was
// a cut: nothing on screen survived it, and nothing said the four places
// were parts of the same app. Cards float over this instead. It is behind
// every tab, it is behind every sheet, and it is the same sphere the cold
// open draws — so the opening hands over to a world that is already there
// rather than fading to an unrelated page.
//
// ── Still, on purpose ────────────────────────────────────────────────────
//
// The last globe in this app was three seconds of WebGL and a hundred and
// fifty arcs, and it was turned off because it stuttered on a real phone.
// This one is five SVG shapes with no animation of any kind: it costs one
// paint at mount and nothing afterwards, forever. A backdrop that drops
// frames is worse than no backdrop, and a backdrop is not worth a single
// dropped frame.
//
// Low contrast because it is ground, not content. If it competes with a card
// it has failed, and the way to check is to look at a screen and not notice
// it until you go looking.

export default function GroundGlobe() {
  return (
    <div className="ground" aria-hidden="true">
      <svg className="ground-globe" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
        {/* The same geometry as the cold open's sphere, moved to its own
            square viewBox: an outline, two meridians, two latitudes. Drawn
            rather than shaded, because a shaded globe at this opacity is a
            grey smudge and an outlined one still reads as a globe. */}
        <g className="ground-line" fill="none" strokeLinecap="round">
          <circle cx="100" cy="100" r="58" />
          <ellipse cx="100" cy="100" rx="24" ry="58" />
          <ellipse cx="100" cy="100" rx="45" ry="58" />
          <path d="M45 82 H155" />
          <path d="M45 118 H155" />
        </g>
      </svg>
    </div>
  )
}
