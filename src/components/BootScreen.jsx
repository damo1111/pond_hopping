import { useEffect, useRef, useState } from 'react'
import { carryTo, receiveThe, RECEIVE_AT, waitForLanding } from '../lib/landing.js'
import { track } from '../lib/analytics.js'

// The cold open.
//
// The last attempt at this was the globe: three seconds of WebGL, a hundred
// and fifty arcs mounting, on a phone. It looked right on a desktop and
// stuttered on the device, so it got turned off — which left the duck sitting
// still on a cream page, which is worse than either.
//
// This one is built to a budget instead. Everything here is SVG stroke and
// CSS transform: no canvas, no WebGL, no layout, nothing the compositor can't
// do on its own thread. A dozen paths and three circles is work an eight-year
// -old WebView can do at sixty frames a second, which is the only kind of
// motion worth shipping to a phone.
//
// Act one: a meridian sphere draws itself, a line crosses it, the duck lands
// at the far end, and the name resolves. Pond hopping — the thing the app is
// called, happening.
//
// ── Why the payoff comes before the method ────────────────────────────
//
// Act two used to be three photographs folding onto a globe under the line
// "Your photos already know where you went." One source, stated as the whole
// story — so anybody whose trips are not photographed heard *this isn't for
// you* in the first five seconds. The richest trip in this app has no
// photographs at all. It is made of flights, runs and things somebody wrote.
//
// So the order is inverted. The trip arrives first, finished and specific,
// with its own numbers counting up — sixteen days, five flights, eighteen
// thousand kilometres. Then it runs backwards: the route retracts, the pins
// gather, and all of it collapses into one small photograph. Only then does
// the line land, and by then it is describing something already watched
// rather than making a promise.
//
// ── The numbers are real ──────────────────────────────────────────────
//
// Every figure below is China & Japan as the database holds it, checked
// rather than chosen: 16 days, 5 flights, 18,169 km, 9 runs, 16 written,
// 2 countries. Baked in rather than queried because this plays before
// anything has loaded — but baked in *true*, because an opening that shows
// a number the app cannot produce is a promise the first screen breaks.
//
// It only ever runs once. `cold` is welded to the same first-run flag the
// rest of the opening is: seven seconds is an opening on launch one and a
// toll booth on launch forty. Every later launch gets act one, cut short.

/** The six that land hardest, in the order they arrive. `to` is the real
 *  figure; `comma` marks the one big enough to need grouping. */
// Three to a row, evenly spaced across the same 100-wide middle the card
// sits in, so the two rows read as a block rather than as six loose items.
//
// No glyphs. The mock had a ✈ beside the flights and a 👟 beside the runs,
// and on a real device those resolve to the platform's own emoji — a blue
// trainer, in the middle of a page that is gold and ink. A label already
// says which number is which.
const FIGURES = [
  { to: 16, label: 'DAYS', x: 56, row: 0 },
  { to: 5, label: 'FLIGHTS', x: 100, row: 0 },
  { to: 9, label: 'RUNS', x: 144, row: 0 },
  // 18,169 sits in the middle, and the row balances because of it.
  //
  // On the left it was three times the width of anything beside it and
  // dragged the whole row that way — six figures meant to read as a block,
  // with the second line visibly heavier on one side than the first. The
  // widest thing on a centred row belongs in the centre.
  { to: 16, label: 'WRITTEN', x: 56, row: 1 },
  { to: 18169, label: 'KM FLOWN', x: 100, row: 1, comma: true },
  { to: 2, label: 'COUNTRIES', x: 144, row: 1 },
]

/** When each figure starts counting, and how long it takes. Matches the
 *  `figin` delays in the stylesheet — the number rolls as its group rises. */
const FIRST_FIGURE_AT = 3300
const FIGURE_GAP = 150
const COUNT_MS = 420

export default function BootScreen({ leaving, cold = false }) {
  const stage = useRef(null)

  // The count-up, the one thing here CSS cannot do. rAF rather than a timer
  // per figure: one loop, six reads, and it stops itself the moment the last
  // number has arrived rather than running for the life of the screen.
  //
  // Reduced motion gets the finished figures immediately. Somebody who has
  // asked for less movement should still be told what the trip was.
  useEffect(() => {
    if (!cold || !stage.current) return
    const nums = [...stage.current.querySelectorAll('.boot-num')]
    if (!nums.length) return

    const show = (el, v) =>
      (el.textContent = el.dataset.comma ? v.toLocaleString('en-GB') : String(v))

    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (still) {
      nums.forEach((el) => show(el, Number(el.dataset.to)))
      return
    }

    const began = performance.now()
    let frame = 0
    const tick = () => {
      const gone = performance.now() - began
      let running = false
      nums.forEach((el, i) => {
        const to = Number(el.dataset.to)
        const from = FIRST_FIGURE_AT + i * FIGURE_GAP
        const part = Math.max(0, Math.min(1, (gone - from) / COUNT_MS))
        if (part < 1) running = true
        // Cubed ease-out: fast to nearly-there, then a visible settle. A
        // linear count reads as a progress bar rather than a tally.
        show(el, Math.round(to * (1 - (1 - part) ** 3)))
      })
      if (running) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [cold])

  /**
   * The card carries.
   *
   * The opening ends on a trip — flags, name, dates — and the app it hands
   * to has that same trip as a card on the World tab. A dissolve between
   * them is a cut with a fade painted on it: everything the last six seconds
   * built disappears, and a different screen is there instead.
   *
   * So the card does not disappear. It is measured where it stands, the real
   * card is measured where it sits, and it travels from one to the other
   * while everything around it goes. What lands under a thumb is the trip
   * that was just being counted up.
   *
   * Measured rather than choreographed, because the target moves: the
   * carousel scrolls, the phone rotates, and a card two hundred pixels wide
   * on one device is a hundred and forty on another. A number written here
   * would be right on the machine it was written on.
   *
   * Falls back to the plain fade when there is nothing to land on — no demo
   * trip, an empty account, a first run with the World tab still loading. An
   * opening that ends by flying a card to nowhere is worse than one that
   * simply ends.
   */
  const cardLayer = useRef(null)
  const [carrying, setCarrying] = useState(false)
  useEffect(() => {
    if (!leaving || !cold) return
    let dropped = false
    let receiving = null

    // Kept looking for, rather than asked once.
    //
    // The original measured in the frame `leaving` flipped. WorldTab is
    // lazily loaded behind Suspense and its cards come from a query, so on a
    // cold start the target can still be a hundred milliseconds away —
    // asking once means asking too early and never asking again, and the
    // handoff falls back to the plain fade for a reason that has nothing to
    // do with whether there was a card.
    waitForLanding(document).then((target) => {
      if (dropped) return
      const card = cardLayer.current?.querySelector('.boot-card')
      const flight = card && target ? carryTo(card.getBoundingClientRect(), target.getBoundingClientRect()) : null

      // Said out loud, either way.
      //
      // A failed handoff, a handoff never attempted, and the plain fade were
      // three different things that looked identical — and it has been
      // reported twice as "the animation is fine but it doesn't bounce into
      // the app" with no way to tell which of the three happened. Now the
      // session says.
      if (!flight) {
        track('cold_open_no_landing', {
          card: Boolean(card),
          target: Boolean(target),
          // Which of the two it was. A missing target is the World tab not
          // being ready or having nothing on it; a zero-width box is a card
          // that exists and has not been laid out.
          why: !target ? 'nothing to land on' : !card ? 'no card to carry' : 'not laid out yet',
        })
        return
      }

      card.style.setProperty('--fly-x', `${flight.x}px`)
      card.style.setProperty('--fly-y', `${flight.y}px`)
      card.style.setProperty('--fly-s', String(flight.scale))
      track('cold_open_carried')
      setCarrying(true)

      // And the card being landed on answers, just before the flight ends,
      // so the two overlap and it reads as one object arriving rather than
      // as one layer stopping on top of another.
      receiving = setTimeout(() => receiveThe(target), RECEIVE_AT)
    })

    return () => {
      dropped = true
      clearTimeout(receiving)
    }
  }, [leaving, cold])

  return (
    <div
      className={`boot${leaving ? ' leaving' : ''}${cold ? ' boot--cold' : ''}${
        carrying ? ' boot--carrying' : ''
      }`}
      ref={stage}
    >
      <div className="boot-stage">
        <svg className="boot-globe" viewBox="0 0 200 260" aria-hidden="true">
          {/* The sphere: an outline and four meridians, drawn on rather than
              faded in, so it reads as being made rather than revealed. */}
          <g className="bg-sphere" fill="none" strokeLinecap="round">
            <circle className="bg-line bg-l1" cx="100" cy="86" r="58" />
            <ellipse className="bg-line bg-l2" cx="100" cy="86" rx="24" ry="58" />
            <ellipse className="bg-line bg-l3" cx="100" cy="86" rx="45" ry="58" />
            <path className="bg-line bg-l4" d="M45 68 H155" />
            <path className="bg-line bg-l5" d="M45 104 H155" />
          </g>

          {/* The hop. A great circle drawn as one arc, dashed, so it reads as
              a route rather than as a line. */}
          <path className="boot-arc" d="M58 118 Q100 44 146 70" fill="none" strokeLinecap="round" />

          {/* Where it left. There is no pin at the other end — the duck is
              the marker, and a dot under it just looks like a smudge. */}
          <circle className="boot-pin-a" cx="58" cy="118" r="3.5" />

          {/* The water rings out from under its feet. 70 is the waterline the
              landing ends on — the duck sits at the arc's far end, not near
              it, which is the note that came back on the mock. */}
          <g className="boot-rings" fill="none">
            <ellipse className="boot-ring boot-ring-1" cx="146" cy="70" rx="10" ry="3.4" />
            <ellipse className="boot-ring boot-ring-2" cx="146" cy="70" rx="10" ry="3.4" />
            <ellipse className="boot-ring boot-ring-3" cx="146" cy="70" rx="10" ry="3.4" />
          </g>

          {cold && (
            <>
              {/* The trip, drawn as itself: a route across the sphere with a
                  stop at each end and one in the middle. It is the same three
                  points the pins gather from later, which is what makes the
                  rewind read as *this* trip collapsing rather than a new
                  animation starting. */}
              {/* Starts on the pin, not near it.
                  The pin is at 58,118 and this began at 62,108 — eleven
                  units adrift, which on a 200-wide stage is a visible gap
                  with a round cap on one side of it and a black dot on the
                  other. Two marks where there should be one departure. The
                  dashed arc above already started at 58,118; this is now
                  the same point, so the route leaves from where the journey
                  is marked as beginning. */}
              <path className="boot-leg" d="M58 118 Q84 82 104 92 T142 72" fill="none" strokeLinecap="round" />
              <g className="boot-stop boot-stop-1" style={{ '--gx': '38px', '--gy': '52px' }}>
                <circle cx="62" cy="108" r="3.4" />
              </g>
              <g className="boot-stop boot-stop-2" style={{ '--gx': '-4px', '--gy': '68px' }}>
                <circle cx="104" cy="92" r="3.4" />
              </g>
              <g className="boot-stop boot-stop-3" style={{ '--gx': '-42px', '--gy': '88px' }}>
                <circle cx="142" cy="72" r="3.4" />
              </g>

              {/* Six figures on two rows, each centred on its own column so
                  the numbers line up under their labels rather than beside
                  them. tabular-nums in the stylesheet stops the row jittering
                  while they count. */}
              <g className="boot-figures">
                {FIGURES.map((f, i) => (
                  <g className={`boot-fig boot-fig-${i + 1}`} key={f.label}>
                    <text
                      className="boot-num"
                      x={f.x}
                      y={f.row ? 240 : 216}
                      textAnchor="middle"
                      data-to={f.to}
                      data-comma={f.comma ? '1' : undefined}
                    >
                      0
                    </text>
                    <text className="boot-lab" x={f.x} y={f.row ? 249 : 225} textAnchor="middle">
                      {f.label}
                    </text>
                  </g>
                ))}
              </g>

            </>
          )}
        </svg>

        {/* The card, on its own layer.
            It has to outlive the fade. Everything else on this screen goes
            when the opening ends — globe, route, duck, name — and the card
            does not: it travels to where the real trip sits on the World tab
            and hands over to it. Inside the stage's own <svg> it would fade
            with its parent, so it gets a sibling layer of identical geometry
            that the leave animation leaves alone. */}
        {cold && (
          <svg className="boot-card-layer" viewBox="0 0 200 260" aria-hidden="true" ref={cardLayer}>
              {/* The card. Flags, then the name, then the dates — the order
                somebody reads a trip in. The two flags overlap slightly so
                they read as one mark rather than two stickers. */}
            <g className="boot-card">
              {/* Drawn rather than emoji, because this plays before a font
                  can be relied on and an emoji flag is a font.

                  Drawn as flags, though. They were discs — a plain red dot
                  for China and a white dot with a red centre for Japan — and
                  a red dot is not a flag, it is a full stop. Two of them side
                  by side read as punctuation, which is what they looked like.

                  Flags are rectangles, so these are rectangles: three by two,
                  the ratio both of these actually use. China gets its star,
                  which is the entire difference between a flag and a red
                  rectangle; the four small ones ride along because at this
                  size their absence is what you notice. Japan keeps the ink
                  outline it was given, for the reason it was given it — the
                  page is #F5F2EB and a white flag on it is invisible. */}
              <g className="boot-flags">
                {/* Overlapping, and separated by the page rather than by a
                    line: the veil behind the second cuts a hairline of --bg
                    between them, so they stack the way two stickers would
                    rather than butting up like a mistake. */}
                <rect x="88" y="157.6" width="13" height="8.7" rx="1" fill="#DE2910" />
                <path
                  className="boot-flag-star"
                  d="M92.60 157.90L93.16 159.63L94.98 159.63L93.51 160.70L94.07 162.42L92.60 161.36L91.13 162.42L91.69 160.70L90.22 159.63L92.04 159.63Z"
                />
                <path className="boot-flag-star" d="M96.10 157.45L96.31 158.11L97.00 158.11L96.45 158.51L96.66 159.17L96.10 158.76L95.54 159.17L95.75 158.51L95.20 158.11L95.89 158.11Z" />
                <path className="boot-flag-star" d="M97.20 159.55L97.41 160.21L98.10 160.21L97.55 160.61L97.76 161.27L97.20 160.86L96.64 161.27L96.85 160.61L96.30 160.21L96.99 160.21Z" />
                <path className="boot-flag-star" d="M96.30 161.65L96.51 162.31L97.20 162.31L96.65 162.71L96.86 163.37L96.30 162.96L95.74 163.37L95.95 162.71L95.40 162.31L96.09 162.31Z" />

                <rect className="boot-flag-veil" x="97.6" y="156.2" width="15.8" height="11.5" rx="1.6" />
                <rect className="boot-flag-jp" x="99" y="157.6" width="13" height="8.7" rx="1" fill="#FFFFFF" />
                <circle cx="105.5" cy="161.95" r="2.4" fill="#BC002D" />
              </g>
              <text className="boot-trip" x="100" y="178" textAnchor="middle">
                China &amp; Japan
              </text>
              <text className="boot-when" x="100" y="188" textAnchor="middle">
                21 MAY – 5 JUN
              </text>
              <path className="boot-rule" d="M56 196 H144" />
            </g>
          </svg>
        )}

        {/* The duck rides the arc. Keyframed translate rather than an
            offset-path: the motion is indistinguishable at this size and
            offset-path is the one thing here an older WebView might not have.
            Two elements because the flight and the bob are both transforms and
            one element can only hold one — the wrapper flies, the duck bobs. */}
        <span className="boot-duck-fly">
          <img className="boot-duck" src="/duck.png" alt="" />
        </span>
      </div>

      <div className="boot-title">
        <span className="app-title-thin">Pond</span>
        <span className="app-title-bold">Hopping</span>
      </div>

      {/* No line.
          "You already have the first piece. A photo. A run. A day you barely
          noticed." — a promise, arriving immediately after two seconds of
          the thing itself: a real trip, with its real days and flights and
          kilometres counting up. Sixteen days of Japan is the argument.
          Telling somebody what they have just watched adds nothing to it,
          and holding the screen for four more seconds to do so is the part
          that costs. The name lands, and the trip is next. */}
    </div>
  )
}
