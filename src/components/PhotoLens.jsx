import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { atEnd, atStart, keptPlace, saidAs, step, swipedTo } from '../lib/lens.js'

// Opening a photograph, and moving to the next one.
//
// The planner's Photos tab rendered bare <img> tags with no click handler on
// them at all. Not a broken viewer — no viewer. Reported as "I cannot tap
// into them or scroll through them", which is exactly what it was.
//
// Three ways through, because three different people are holding the phone:
// swipe, the arrows, and the keyboard. The arrows go grey at the ends rather
// than disappearing, so the control does not move under a thumb that is
// tapping it repeatedly.
//
// A portal, so the backdrop is not trapped inside the planner's own scrolling
// sheet — which is what would otherwise make a full-screen viewer scroll with
// the page behind it.

/**
 * @param photos  the set, in the order they are shown
 * @param at      index to open on
 * @param onClose called with nothing; the caller owns whether it is open
 */
export default function PhotoLens({ photos = [], at = 0, onClose }) {
  const [i, setI] = useState(at)
  const touch = useRef(null)

  // Follow the photograph, not the number.
  //
  // Removals and arriving imports both rewrite this list underneath the
  // viewer. Holding an index alone means the set shifting by one silently
  // changes which photograph somebody is looking at — and an emptied set
  // means index -1, which renders nothing and looks like a crash.
  const looking = photos[i] ?? null
  const mine = useRef({ id: looking?.id, at: i })
  useEffect(() => {
    mine.current = { id: photos[i]?.id, at: i }
  }, [photos, i])
  useEffect(() => {
    const place = keptPlace(mine.current, photos)
    if (place === null) {
      onClose?.()
      return
    }
    if (place !== i) setI(place)
    // Only when the set itself changes. Watching `i` too would fight the
    // arrows, which are the thing changing `i` on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos])

  const move = useCallback((by) => setI((was) => step(was, by, photos.length)), [photos.length])

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
    }
    globalThis.addEventListener?.('keydown', key)
    return () => globalThis.removeEventListener?.('keydown', key)
  }, [move, onClose])

  if (!looking) return null

  const start = (e) => {
    const t = e.touches?.[0]
    touch.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  const end = (e) => {
    const from = touch.current
    const t = e.changedTouches?.[0]
    touch.current = null
    if (!from || !t) return
    const by = swipedTo(t.clientX - from.x, t.clientY - from.y)
    if (by) move(by)
  }

  return createPortal(
    <div className="lens" onClick={onClose} onTouchStart={start} onTouchEnd={end}>
      {/* The picture stops the tap, so tapping it does not close what you
          just opened — the backdrop is the way out, and so is the ✕. */}
      <img className="lens-img" src={looking.url || looking.thumb_url} alt={looking.caption || ''} onClick={(e) => e.stopPropagation()} />

      <button className="lens-close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      <button
        className="lens-step lens-step--back"
        disabled={atStart(i)}
        aria-label="Previous"
        onClick={(e) => {
          e.stopPropagation()
          move(-1)
        }}
      >
        ‹
      </button>
      <button
        className="lens-step lens-step--on"
        disabled={atEnd(i, photos.length)}
        aria-label="Next"
        onClick={(e) => {
          e.stopPropagation()
          move(1)
        }}
      >
        ›
      </button>

      <div className="lens-foot" onClick={(e) => e.stopPropagation()}>
        {looking.caption && <div className="lens-caption">{looking.caption}</div>}
        <div className="lens-where">
          {[looking.city, looking.taken_on].filter(Boolean).join(' · ')}
        </div>
        {/* Where you are in the set. A viewer with no position in it is a
            picture with no idea how much more there is. */}
        <div className="lens-count">{saidAs(i, photos.length)}</div>
      </div>
    </div>,
    document.body
  )
}
