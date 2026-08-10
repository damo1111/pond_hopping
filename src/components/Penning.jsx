import { useEffect, useState } from 'react'

// Something happening while the planner thinks.
//
// The word "thinking…" sat there unchanged for as long as the call took,
// which on this model is long enough that David twice reported it as stuck.
// It wasn't stuck — it returns 200, it is just slow — but a screen with no
// moving parts cannot tell you the difference, and after four or five
// seconds a person is right to assume the worse of the two.
//
// So: a nib writing a line. It says nothing about progress, because there
// is no progress to report — a single request is either outstanding or it
// is not — and a fake progress bar filling to 90% and stopping would be a
// lie told slowly. A pen moving is only a claim that something is running,
// which is exactly the claim worth making.

// After this, say so out loud. Somebody who has waited this long has
// stopped assuming and started wondering.
const LONG_MS = 9000

export default function Penning({ label = 'Thinking' }) {
  const [long, setLong] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLong(true), LONG_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="penning" role="status" aria-live="polite">
      <span className="penning-ink" aria-hidden="true">
        <svg viewBox="0 0 120 28" fill="none">
          {/* The line being written. Drawn by walking its own dash offset,
              so the stroke appears left to right rather than fading in. */}
          <path
            className="penning-line"
            d="M4 20c6-9 11-9 15-2s9 8 14 1 10-8 14-1 9 8 14 1 10-8 14-1 9 8 14 1 8-7 12-3"
            strokeLinecap="round"
          />
          {/* The nib, travelling the same distance in the same time. */}
          <g className="penning-nib">
            <path d="M0 14 6 2l3 2-5 12z" />
            <path d="M4 16 1 21l5-2z" />
          </g>
        </svg>
      </span>
      <span className="penning-label">
        {label}
        {long && <span className="penning-still">still going — this one's a slow one</span>}
      </span>
    </div>
  )
}
