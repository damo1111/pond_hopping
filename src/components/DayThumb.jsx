import { useMemo } from 'react'
import { tileFrame } from '../lib/webMercator.js'

// A day's map, in the journal, without a map.
//
// Same argument as RunThumb, which this is a sibling of: a Leaflet instance
// per journal entry is a dozen maps with their own handlers and animation
// frames inside a list that has to scroll. A thumbnail never pans, so it
// only needs the right pixels — the two or three tiles covering the day,
// with the day drawn over them.
//
// What it draws is the shape of the day: the places you stopped, in order,
// and the line between them. Where a run has a GPS track that goes
// underneath in the run's own colour, because a 21 km loop through Rome is
// most of what that day's map is.

const W = 320
const H = 132
const TILES = 'https://a.basemaps.cartocdn.com/light_all'

export default function DayThumb({ stops = [], run = null, color = '#A8842C' }) {
  const pts = stops.filter((s) => s?.lat != null && s?.lon != null).map((s) => [s.lat, s.lon])
  const runPts = Array.isArray(run?.coords) ? run.coords : []

  // Framed on everything at once, so the run and the stops are in the same
  // picture at the same scale rather than two maps of the same morning.
  const frame = useMemo(() => tileFrame([...runPts, ...pts], W, H, { pad: 14, maxZoom: 15 }), [
    JSON.stringify(pts),
    runPts.length,
  ])
  const runFrame = useMemo(
    () => (runPts.length ? tileFrame([...runPts, ...pts], W, H, { pad: 14, maxZoom: 15 }) : null),
    [JSON.stringify(pts), runPts.length]
  )

  if (!frame) return null

  // The stops' own positions inside that frame, which needs projecting
  // separately because the frame was fitted to run + stops together.
  const stopFrame = pts.length ? tileFrame(pts, W, H, { pad: 14, maxZoom: 15 }) : null
  const marks = pts.length && runPts.length === 0 ? stopFrame?.points ?? [] : dotsIn(frame, runPts.length, pts.length)

  return (
    <div className="day-thumb" style={{ '--day-color': color }} aria-hidden="true">
      {frame.tiles.map((t) => (
        <img
          key={`${t.z}/${t.x}/${t.y}`}
          className="day-thumb-tile"
          src={`${TILES}/${t.z}/${t.x}/${t.y}.png`}
          style={{ left: t.left, top: t.top }}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden'
          }}
        />
      ))}
      <svg className="day-thumb-line" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {runFrame && (
          <>
            {/* Casing then core, as on the big map: one stroke disappears
                wherever it crosses a road of the same tone. */}
            <path d={runPath(runFrame, runPts.length)} fill="none" stroke="#FFFFFF" strokeWidth="4.5"
              strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            <path d={runPath(runFrame, runPts.length)} fill="none" stroke={run?.color || '#5EAA7A'}
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {marks.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="5.5" fill="#FFFFFF" opacity="0.92" />
            <circle cx={p.x} cy={p.y} r="3.4" fill="var(--day-color)" />
          </g>
        ))}
      </svg>
    </div>
  )
}

/** The run's own points out of a frame fitted to run + stops together. */
function runPath(frame, howMany) {
  return frame.points
    .slice(0, howMany)
    .map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`)
    .join(' ')
}

/** The stops, which were appended after the run's points. */
function dotsIn(frame, runCount, stopCount) {
  return frame.points.slice(runCount, runCount + stopCount)
}
