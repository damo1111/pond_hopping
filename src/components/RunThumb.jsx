import { useMemo } from 'react'
import { tileFrame } from '../lib/webMercator.js'

// The map behind a run's thumbnail, without a map.
//
// A Leaflet instance per row is the obvious way and the wrong one: five runs
// is five maps with their own handlers, layers and animation frames, inside a
// list we spent two commits making scroll smoothly. A thumbnail never pans or
// zooms — it only needs the right pixels — so this places the two or three
// tiles that cover the route and draws the route over them. A few cached
// <img>s, no JavaScript map.

const W = 96
const H = 64
const TILES = 'https://a.basemaps.cartocdn.com/light_all'

export default function RunThumb({ coords, color = '#3E7D54' }) {
  const frame = useMemo(() => tileFrame(coords, W, H, { pad: 9, maxZoom: 15 }), [coords])

  // A run logged without a GPS trace still happened.
  if (!frame) return <span className="run-track-none" aria-hidden="true" />

  return (
    <div className="run-thumb" style={{ '--run-color': color }} aria-hidden="true">
      {frame.tiles.map((t) => (
        <img
          key={`${t.z}/${t.x}/${t.y}`}
          className="run-thumb-tile"
          src={`${TILES}/${t.z}/${t.x}/${t.y}.png`}
          style={{ left: t.left, top: t.top }}
          alt=""
          loading="lazy"
          /* A tile that doesn't come back leaves the paper behind it, not a
             broken-image icon in the middle of the route. */
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden'
          }}
        />
      ))}
      <svg className="run-thumb-line" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {/* Casing then core, same as the big map: a single stroke vanishes
            wherever it crosses a road of similar tone. */}
        <path d={frame.path} fill="none" stroke="#FFFFFF" strokeWidth="4"
          strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <path d={frame.path} fill="none" stroke="var(--run-color)" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
