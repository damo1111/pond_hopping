import { sceneFor } from '../lib/drawnScene.js'

// A drawn cover for a trip with no photograph on it yet.
//
// The gradient that was here was better than the blank it replaced, but it
// still read as an absence. The Add-a-trip tile already draws a globe, an
// arc and the duck, and people like it — so this is its sibling: the same
// dashed hop across the top, the same duck on the horizon, and a landscape
// underneath that varies by trip so a row of them isn't wallpaper.
//
// Drawn rather than photographed on purpose. There is no stock-photo
// service wired into this app, and adding one would mean a key, a bill,
// per-image licensing and a network round trip to decorate a card that
// exists precisely because nothing has been uploaded yet. This costs
// nothing, works on a plane, and is in the app's own hand.
//
// Everything is stroked in var(--card-accent), which the card already sets
// from the trip's colour — so the picture belongs to the trip rather than
// being a generic placeholder pasted over it.

// Everything lives between y=14 and y=66 of a 78-high box. The box is
// scaled to fill (`slice`), and a cover is wider than 172:78 on most
// screens, so the top and bottom bands get cropped by an amount that
// depends on the card's width. Drawing into the middle is what keeps the
// horizon on the card at every size.
const HORIZON = 54

function Peaks() {
  return (
    <>
      <path className="dc-far" d="M2 54 26 32 44 44 62 30 88 54Z" />
      <path className="dc-near" d="M72 54 96 38 112 46 132 32 158 54Z" />
    </>
  )
}

function Coast() {
  return (
    <>
      {/* Kept clear of the left corner, which the duck stands in. */}
      <path className="dc-far" d="M30 54c6-10 12-14 18-14s13 5 18 14Z" />
      <path className="dc-near" d="M108 54c5-8 10-11 15-11s10 3 15 11Z" />
      <g className="dc-waves">
        <path d="M74 60q6-4 12 0t12 0 12 0" />
        <path d="M14 65q6-4 12 0t12 0 12 0" />
        <path d="M96 66q6-4 12 0t12 0 12 0" />
      </g>
    </>
  )
}

function City() {
  return (
    <path
      className="dc-city"
      d="M12 54V38h13v16M29 54V26h11v28M44 54V44h9v10M57 54V32h15v22M76 54V42h11v12M91 54V24h10v30M105 54V38h13v16M122 54V30h11v24M137 54V44h10v10M151 54V34h13v20"
    />
  )
}

const DRAW = { peaks: Peaks, coast: Coast, city: City }

export default function DrawnCover({ slug }) {
  const scene = sceneFor(slug)
  const Scene = DRAW[scene]
  return (
    <>
      <svg className="dc-svg" viewBox="0 0 172 78" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {/* The hop. Same dashes as the Add-a-trip tile, but it lands: a
            filled dot where you left, a ring where you got to. */}
        <path className="dc-arc" d="M16 26C46 14 122 12 154 22" />
        <circle className="dc-from" cx="16" cy="26" r="2.8" />
        <circle className="dc-to" cx="154" cy="22" r="5" />
        {/* Drawn after the arc, so the hop passes behind the landscape
            rather than over the top of it. */}
        <Scene />
        <path className="dc-ground" d={`M0 ${HORIZON}h172`} />
      </svg>
      <img className="dc-duck" src="/duck.png" alt="" />
    </>
  )
}
