import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { seen, markSeen, ONCE } from '../lib/firstRun.js'
import { track } from '../lib/analytics.js'
import { cardSide } from '../lib/tourPlacement.js'

// Three tooltips, pointing rather than telling: the example trip, the row
// it sits in, and the tile that starts a real one. The app had this once —
// three steps behind an overlay, gated on `pond:tourdone` — and took it out
// because it repeated what a card already said, ten seconds apart. That
// card is gone now; the cold open is the pitch. What's left to explain is
// purely spatial — "that one's not yours, this is where yours will go, tap
// here to start" — which is exactly what a hand pointing at the screen says
// better than any paragraph does, so this is a pointer, not a pitch.
//
// Runs once, on Home, only while there's nothing real to point at instead
// (WorldTab passes `active` for that; nothingReal in frontOfMind's terms,
// and not before the cold open has actually finished — see the boot check
// in that `active` expression, added after this ran the moment Home
// mounted and revealed itself, ring and all, the instant the opening
// ended rather than after it).
// The moment a real trip exists none of the three things below are true any
// more, so it isn't shown at all rather than shown wrong.
const STEPS = [
  {
    selector: '.wt-card--demo',
    eyebrow: 'Example',
    title: "Someone else's pond",
    body: "A real trip, parked here so the place isn't empty. Have a paddle round — it clears off the moment you add one of your own.",
  },
  {
    selector: '.world-trips',
    eyebrow: 'Your trips',
    title: 'Where yours will line up',
    body: 'Photos in, a booking forwarded, a Timeline export dropped in — whatever lands, it queues up here: what’s ahead of you, and what’s behind.',
  },
  {
    selector: '.wt-front--add',
    eyebrow: 'Start here',
    title: 'Where to start',
    body: "Drop in photos, a booking you forward without reading, or years of Google Timeline. I'll work out the trip.",
  },
]

export default function DemoTour({ active }) {
  const [step, setStep] = useState(-1)
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!active || seen(ONCE.demo_tour)) return
    // Lets the hero and the strip finish laying out — images decoding,
    // fonts swapping in — before anything is measured. Starting on the
    // render that makes `active` true would as often as not point a ring
    // at where the target is about to be, not where it is.
    const t = setTimeout(() => {
      setStep(0)
      track('demo_tour_started', {})
    }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useEffect(() => {
    if (step < 0) return undefined
    const measure = () => {
      const el = document.querySelector(STEPS[step]?.selector ?? '')
      setRect(el ? el.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step])

  if (step < 0 || !STEPS[step]) return null
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  // See tourPlacement.js: docks the card to whichever side of the target has
  // more room, so it never sits on top of its own ring — which a card fixed
  // to the bottom of the screen did, every time, because the ring and the
  // bottom nav both live in the same third of Home.
  const side = cardSide(rect, window.innerHeight)
  // top and bottom cleared explicitly on whichever axis isn't in use — set
  // together with only one meant to apply, the fixed box stretches to fill
  // the gap between them instead of sitting at its natural height.
  const cardStyle = !rect
    ? undefined
    : side === 'below'
      ? { top: rect.bottom + 12, bottom: 'auto' }
      : { bottom: window.innerHeight - rect.top + 12, top: 'auto' }

  function finish(how) {
    markSeen(ONCE.demo_tour)
    track('demo_tour_done', { steps: step + 1, of: STEPS.length, how })
    setStep(-1)
  }

  function next() {
    if (last) return finish('finished')
    track('demo_tour_step', { step: step + 1, of: STEPS.length })
    setStep((s) => s + 1)
  }

  return createPortal(
    <>
      {/* Transparent on purpose — the dimming is the ring's own shadow,
          this only catches a tap on the part of the screen that isn't it,
          the same "tap outside to leave" every sheet in the app already
          offers. */}
      <div className="dtour-veil" onClick={() => finish('tapped_outside')} />
      {rect && (
        <div
          className="dtour-ring"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div className="dtour-card" role="dialog" aria-label={s.title} style={cardStyle}>
        <div className="dtour-progress">
          {STEPS.map((_, i) => (
            <span key={i} className={`dtour-dot${i === step ? ' on' : i < step ? ' done' : ''}`} />
          ))}
        </div>
        <div className="dtour-eyebrow">{s.eyebrow}</div>
        <div className="dtour-title">{s.title}</div>
        <div className="dtour-body">{s.body}</div>
        <div className="dtour-actions">
          <button className="dtour-skip" onClick={() => finish('skipped')}>
            Skip
          </button>
          <button className="dtour-next" onClick={next}>
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
