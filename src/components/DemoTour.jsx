import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { STEPS, TOUR_SEEN_KEY, visibleSteps } from '../lib/demoTour.js'

// A first-run walkthrough of the example trip.
//
// Two rules do most of the work, and both live in demoTour.js where they can
// be tested: it only runs when the demo is the *only* trip, and it stops for
// good the moment there is one real one. A tour that outlives its welcome is
// just someone else's holiday nagging you about your own app.
//
// The tooltip is positioned against a live element rather than placed by hand,
// so it stays right when the carousel scrolls or the phone rotates. A step
// whose anchor isn't on screen is dropped instead of pointing at nothing.
export default function DemoTour({ onDone }) {
  const [i, setI] = useState(0)
  const [steps, setSteps] = useState(() => visibleSteps())
  const [box, setBox] = useState(null)
  // The tip's own height, measured rather than assumed — the copy differs
  // per step and a three-line body is a lot taller than a one-line one.
  const [tipH, setTipH] = useState(0)
  const tipRef = useRef(null)

  const finish = useCallback(() => {
    try {
      localStorage.setItem(TOUR_SEEN_KEY, '1')
    } catch {
      // A browser that won't persist the flag still gets to dismiss the tour
      // for this session — better a repeat next launch than a stuck overlay.
    }
    onDone?.()
  }, [onDone])

  // Anchors mount at different times — the bottom nav is there immediately,
  // the globe chunk is lazy, and the trip cards wait on a fetch. Resolving
  // once on mount found only the nav and locked the tour to a single step
  // about the Plan tab, which is the least useful third of it.
  //
  // So keep re-resolving until the full set is present, and only settle for
  // less once it is clear the rest are not coming.
  useEffect(() => {
    if (steps.length === STEPS.length) return
    const id = setInterval(() => {
      const found = visibleSteps()
      if (found.length > steps.length) setSteps(found)
      if (found.length === STEPS.length) clearInterval(id)
    }, 200)
    const bail = setTimeout(() => clearInterval(id), 6000)
    return () => {
      clearInterval(id)
      clearTimeout(bail)
    }
  }, [steps.length])

  const step = steps[i]

  // Track the anchor rather than measuring once: the trip strip scrolls, the
  // globe resizes, and a tooltip pinned to a stale rectangle is worse than no
  // tooltip at all.
  useEffect(() => {
    if (!step) return
    let raf = 0
    const measure = () => {
      const el = document.querySelector(step.anchor)
      if (el) {
        const r = el.getBoundingClientRect()
        setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
      }
      raf = requestAnimationFrame(measure)
    }
    raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [step])

  // Before paint, so the tip is never seen at the wrong height first.
  useLayoutEffect(() => {
    const h = tipRef.current?.offsetHeight
    if (h && h !== tipH) setTipH(h)
  })

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && finish()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  if (!step || !box) return null

  // Placed clear of the anchor using the tip's *measured* height, not a guess
  // at it. Guessing 150px put the card's own title and Example badge behind
  // the tooltip that was pointing at them.
  const GAP = 12
  const h = tipH || 0
  const roomBelow = window.innerHeight - (box.top + box.height) - GAP
  const below = roomBelow >= h
  const top = below
    ? box.top + box.height + GAP
    : Math.max(GAP, box.top - h - GAP)
  const last = i === steps.length - 1

  return createPortal(
    <div className="tour" role="dialog" aria-label="Getting started">
      {/* The scrim is one element with a hole punched by a very large ring
          shadow, rather than four divs around the anchor — one layer for the
          compositor and no seams where the pieces meet. */}
      <div
        className="tour-spot"
        style={{
          top: box.top - 6,
          left: box.left - 6,
          width: box.width + 12,
          height: box.height + 12,
        }}
        onClick={finish}
      />
      <div className="tour-tip" ref={tipRef} style={{ top }}>
        <div className="tour-count">
          {i + 1} of {steps.length}
        </div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-body">{step.body}</div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={finish}>
            {last ? 'Done' : 'Skip'}
          </button>
          {!last && (
            <button className="tour-next" onClick={() => setI((n) => n + 1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export { STEPS }
