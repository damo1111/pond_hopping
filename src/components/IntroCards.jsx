import { useEffect, useRef, useState } from 'react'

// What this thing is, before you're asked to do anything with it.
//
// The demo tour explains the demo. Nothing explained the app — so a new
// arrival met a globe, a stranger's trip, and a bottom bar, and had to infer
// the point. Three cards, swiped or tapped through, answering the only three
// questions anyone actually has: what goes in, what it turns into, and who
// else gets to see it.
//
// The art is drawn here rather than fetched: the same meridian sphere,
// dashed great-circle arc and duck the boot screen already uses, so this
// looks like the app instead of like stock illustration. It also means no
// image requests on the one screen you want to appear instantly, and it
// recolours itself in dark mode for free.

const SEEN_KEY = 'pond:intro'

export const introSeen = (store = globalThis.localStorage) => {
  try {
    return store?.getItem(SEEN_KEY) === '1'
  } catch {
    // A browser with storage switched off shows the cards every time, which
    // is a far better failure than never showing them at all.
    return false
  }
}

export const markIntroSeen = (store = globalThis.localStorage) => {
  try {
    store?.setItem(SEEN_KEY, '1')
  } catch {
    /* nothing to do */
  }
}

const Sphere = () => (
  <g className="intro-sphere" fill="none" strokeLinecap="round">
    <circle cx="60" cy="60" r="40" />
    <ellipse cx="60" cy="60" rx="16" ry="40" />
    <ellipse cx="60" cy="60" rx="34" ry="40" />
    <path d="M20 60h80M27 40h66M27 80h66" />
  </g>
)


// One card, not three.
//
// The other two are in docs/copy-parked.md with the reasoning and the words,
// because the writing was good and the moment was wrong. "Watch it fill"
// describes an animation the app already performs, which is better shown at
// the moment the first flight draws itself than promised before there is one;
// "Or don't" is the best sentence in the app about privacy and it answers a
// question nobody has forty seconds after installing.
//
// This one stays because it is the only one that says what the app is *for*,
// and because somebody who opens the app, looks, and leaves without tapping
// anything otherwise learns nothing at all. That person is the whole argument
// for having a card, and one card is the whole of what they need.
const CARDS = [
  {
    id: 'in',
    duck: { left: '66%', top: '63%', size: 44, flip: false },
    title: 'Tip it in',
    body: 'Photos from a trip you took. A Google Timeline export going back years. A booking you forward without reading. Whatever you already have — it works the trip out from there.',
    art: (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <g transform="translate(60 60) scale(1.08) translate(-53 -58)">
        <g className="intro-stack">
          <rect x="20" y="34" width="52" height="42" rx="6" transform="rotate(-10 46 55)" />
          <rect x="34" y="26" width="52" height="42" rx="6" transform="rotate(7 60 47)" />
          <rect x="32" y="20" width="52" height="42" rx="6" />
        </g>
        <circle className="intro-lens" cx="58" cy="41" r="9" />
        <path className="intro-arrow" d="M60 74v22m0 0-8-8m8 8 8-8" fill="none" strokeLinecap="round" />
        </g>
      </svg>
    ),
  },
]

export default function IntroCards({ onDone, beneath = false }) {
  const [i, setI] = useState(0)
  // Live finger offset in pixels, on top of the settled position. Null when
  // no finger is down, which is also how the transition knows to come back.
  const [drag, setDrag] = useState(null)
  const from = useRef(null)
  const last = i === CARDS.length - 1
  const go = (n) => setI(Math.max(0, Math.min(CARDS.length - 1, n)))

  // Escape is the fastest way out on a desktop, and this is the first thing
  // anybody sees — being unable to dismiss it would be a poor introduction.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight') go(i + 1)
      if (e.key === 'ArrowLeft') go(i - 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  function finish() {
    markIntroSeen()
    onDone?.()
  }

  // Swipe, because three cards in a row that only move when you press a
  // button are three slides, not a carousel — and everyone's thumb tries it.
  function onStart(e) {
    const t = e.touches?.[0]
    if (t) from.current = { x: t.clientX, y: t.clientY, at: Date.now(), axis: null }
  }

  function onMove(e) {
    const t = e.touches?.[0]
    if (!t || !from.current) return
    const dx = t.clientX - from.current.x
    const dy = t.clientY - from.current.y
    // Decide once whether this is a swipe or a scroll, and stick to it.
    if (!from.current.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      from.current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (from.current.axis !== 'x') return
    // Resistance at the two ends, so the first and last card feel like ends
    // rather than like something broken.
    const overrun = (i === 0 && dx > 0) || (last && dx < 0)
    setDrag(overrun ? dx * 0.32 : dx)
  }

  function onEnd() {
    const start = from.current
    from.current = null
    if (!start || start.axis !== 'x' || drag === null) return setDrag(null)
    const dt = Math.max(1, Date.now() - start.at)
    const flick = Math.abs(drag) / dt > 0.45 && Math.abs(drag) > 24
    if (flick || Math.abs(drag) > 70) go(i + (drag < 0 ? 1 : -1))
    setDrag(null)
  }

  return (
    <div
      // While the boot screen is still up this is mounted *underneath* it,
      // so that when boot lifts there is a finished screen behind rather
      // than a frame of the working app. That only holds if this is already
      // opaque — and it wasn't: its own 320ms fade-in ran at the same moment
      // as boot's 500ms fade-out, so for half a second there were two
      // half-transparent full-screen layers with the app showing through
      // both. Card text over wordmark over globe over nav, all unreadable,
      // and the two overlapping centred layouts read as one stretched one.
      //
      // So it arrives instantly when it is arriving behind something, and
      // fades only when it is the thing appearing.
      className={`intro-layer${beneath ? ' intro-layer--already' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="What this is"
    >
      <div
        className="intro-viewport"
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onTouchCancel={onEnd}
      >
        <div
          className={`intro-track${drag === null ? ' settling' : ''}`}
          style={{ transform: `translate3d(calc(${-i * 100}% + ${drag ?? 0}px), 0, 0)` }}
        >
          {CARDS.map((c, n) => (
            <div className="intro-card" key={c.id} aria-hidden={n !== i}>
              <div className="intro-art">
                {c.art}
                {c.duck && (
                  <img
                    className="intro-duck"
                    src="/duck.png"
                    alt=""
                    style={{
                      left: c.duck.left,
                      top: c.duck.top,
                      width: c.duck.size,
                      transform: c.duck.flip ? 'scaleX(-1)' : undefined,
                    }}
                  />
                )}
              </div>
              <h2 className="intro-title">{c.title}</h2>
              <p className="intro-body">{c.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="intro-dots">
        {CARDS.map((c, n) => (
          <button
            key={c.id}
            className={`intro-dot${n === i ? ' on' : ''}`}
            aria-label={`Card ${n + 1}`}
            onClick={() => go(n)}
          />
        ))}
      </div>

      <div className="intro-actions">
        <button className="ios-sheet-done" onClick={() => (last ? finish() : go(i + 1))}>
          {last ? 'Let’s go' : 'Next'}
        </button>
        <button
          className="intro-skip"
          onClick={finish}
          aria-hidden={last}
          tabIndex={last ? -1 : 0}
          style={last ? { visibility: 'hidden' } : undefined}
        >
          Skip
        </button>
      </div>
    </div>
  )
}
