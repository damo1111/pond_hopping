import { useEffect, useState } from 'react'

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


const CARDS = [
  {
    id: 'in',
    duck: { left: '68%', top: '62%', size: 46, flip: false },
    title: 'Tip it in',
    body: 'Photos from a trip you took. A Google Timeline export going back years. A booking you forward without reading. Whatever you already have — it works the trip out from there.',
    art: (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <g className="intro-stack">
          <rect x="30" y="46" width="42" height="34" rx="5" transform="rotate(-9 51 63)" />
          <rect x="42" y="40" width="42" height="34" rx="5" transform="rotate(6 63 57)" />
          <rect x="38" y="34" width="42" height="34" rx="5" />
        </g>
        <circle className="intro-lens" cx="59" cy="51" r="8" />
        <path className="intro-arrow" d="M60 84v18m0 0-7-7m7 7 7-7" fill="none" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'globe',
    duck: { left: '70%', top: '18%', size: 42, flip: false },
    title: 'Watch it fill',
    body: 'Every flight becomes a line on the globe, and every day a map of where you actually went. Seventeen years of it, if you’ve got them.',
    art: (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <Sphere />
        <path className="intro-arc" d="M26 78C44 34 82 26 100 44" fill="none" strokeLinecap="round" />
        <circle className="intro-pin" cx="26" cy="78" r="3.5" />
        <circle className="intro-pin" cx="100" cy="44" r="3.5" />
      </svg>
    ),
  },
  {
    id: 'share',
    duck: { left: '64%', top: '66%', size: 44, flip: true },
    title: 'Or don’t',
    body: 'Everything is private until you decide otherwise. Then it’s one link — to a trip, or to the lot — that you can take back whenever you like.',
    art: (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <g className="intro-rings" fill="none">
          <circle cx="60" cy="66" r="16" />
          <circle cx="60" cy="66" r="27" />
          <circle cx="60" cy="66" r="38" />
        </g>
        <path
          className="intro-lock"
          d="M52 58v-6a8 8 0 0 1 16 0v6"
          fill="none"
          strokeLinecap="round"
        />
        <rect className="intro-lock-body" x="48" y="58" width="24" height="19" rx="4" />
      </svg>
    ),
  },
]

export default function IntroCards({ onDone }) {
  const [i, setI] = useState(0)
  const last = i === CARDS.length - 1

  // Escape is the fastest way out on a desktop, and this is the first thing
  // anybody sees — being unable to dismiss it would be a poor introduction.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, CARDS.length - 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  function finish() {
    markIntroSeen()
    onDone?.()
  }

  const card = CARDS[i]

  return (
    <div className="intro-layer" role="dialog" aria-modal="true" aria-label="What this is">
      <div className="intro-card" key={card.id}>
        <div className="intro-art">
          {card.art}
          {card.duck && (
            <img
              className="intro-duck"
              src="/duck.png"
              alt=""
              style={{
                left: card.duck.left,
                top: card.duck.top,
                width: card.duck.size,
                transform: card.duck.flip ? 'scaleX(-1)' : undefined,
              }}
            />
          )}
        </div>
        <h2 className="intro-title">{card.title}</h2>
        <p className="intro-body">{card.body}</p>
      </div>

      <div className="intro-dots">
        {CARDS.map((c, n) => (
          <button
            key={c.id}
            className={`intro-dot${n === i ? ' on' : ''}`}
            aria-label={`Card ${n + 1}`}
            onClick={() => setI(n)}
          />
        ))}
      </div>

      <div className="intro-actions">
        <button className="ios-sheet-done" onClick={() => (last ? finish() : setI(i + 1))}>
          {last ? 'Let’s go' : 'Next'}
        </button>
        {!last && (
          <button className="intro-skip" onClick={finish}>
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
