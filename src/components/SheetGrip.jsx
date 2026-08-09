import { useRef } from 'react'

// The pill at the top of every sheet. It has always looked exactly like the
// iOS drag handle it is imitating, and until now it was a 38×4 div with no
// handlers attached to it anywhere — an affordance promising a gesture the
// app did not implement. People pull it, nothing happens, and the sheet
// looks broken rather than merely tap-to-close.
//
// Written as a component that finds its own sheet rather than a hook each
// sheet has to wire up, because there are seven of them and the interesting
// state — how far you have dragged — never needs to reach React. The
// transform is written straight to the node during the drag, so a gesture
// costs no re-renders at all.

// Far enough that it cannot be a stray thumb, close enough that it doesn't
// feel like work. Matches the distance iOS itself uses closely enough that
// the muscle memory transfers.
export const DISMISS_PX = 96
// A short fast flick should dismiss even if it never travelled that far,
// which is how the gesture actually gets used once it is trusted.
const FLICK_PX = 32
const FLICK_MS = 260

// Below this, a gesture was a tap that wobbled rather than a drag.
const SLOP_PX = 6

export default function SheetGrip({ onClose, label = 'Close' }) {
  const ref = useRef(null)
  const from = useRef(null)
  // A pointerup on a button is followed by a click, so without this every
  // drag — including one released well short of the threshold, which should
  // spring back — ended in the tap handler closing the sheet anyway.
  const dragged = useRef(false)

  const sheet = () => ref.current?.closest('.ios-sheet')

  function down(e) {
    const el = sheet()
    if (!el) return
    from.current = { y: e.clientY, at: Date.now() }
    dragged.current = false
    el.style.transition = 'none'
    // Without capture, a fast drag outruns the element and the pointer events
    // stop arriving — the sheet sticks half-open under your thumb.
    ref.current.setPointerCapture?.(e.pointerId)
  }

  function move(e) {
    const el = sheet()
    if (!from.current || !el) return
    const dy = e.clientY - from.current.y
    if (Math.abs(dy) > SLOP_PX) dragged.current = true
    // Upwards resists rather than refusing, which is what tells you the
    // gesture is live even when you are pulling the wrong way.
    el.style.transform = `translateY(${dy > 0 ? dy : dy / 4}px)`
  }

  function up(e) {
    const el = sheet()
    if (!from.current || !el) return
    const dy = e.clientY - from.current.y
    const ms = Date.now() - from.current.at
    from.current = null

    el.style.transition = ''
    if (dy > DISMISS_PX || (dy > FLICK_PX && ms < FLICK_MS)) {
      el.style.transform = ''
      onClose?.()
      return
    }
    el.style.transform = ''
  }

  return (
    <button
      ref={ref}
      type="button"
      className="ios-sheet-grip"
      aria-label={label}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      // A tap on the handle closes too. Somebody who has decided the sheet
      // should go away has already aimed at the one thing that looks like a
      // control; making them find the backdrop instead is pedantry.
      onClick={() => {
        if (dragged.current) {
          dragged.current = false
          return
        }
        onClose?.()
      }}
    />
  )
}
