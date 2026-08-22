import { useEffect, useMemo, useRef, useState } from 'react'
import CountryFlags from './CountryFlags.jsx'
import { choices, guessHome, nameOf, search } from '../lib/homePond.js'
import { writeHome, syncHome } from '../lib/home.js'
import { isoToEmojiFlag } from '../lib/flags.js'

// The first question, and for a while the only one.
//
// ── Why it is asked first ─────────────────────────────────────────────────
//
// Home is the one thing about a trip the app cannot work out for itself.
// Dates, places, how long, how far — all of that falls out of the
// photographs. Home does not, and without it the word "away" has no meaning:
// "you've been away five days" is a sentence the app literally cannot write
// until somebody says where they came from.
//
// The version before this asked at the first photo upload instead, which
// looked cheaper and was worse. By the time it arrived, somebody was three
// questions deep into a task they came to finish, and the least urgent of the
// three landed last. It also could not help the empty globe, because there
// was nothing on it until they uploaded.
//
// ── Why the wording changed ───────────────────────────────────────────────
//
// "Is your pond the UK?" was the first draft and it is charming and slightly
// unclear. The rule that came out of it: lead plain, and spend the character
// on the answer. So the question is "Where's home?" and the reply is "Your
// pond is the UK" — clear going in, Pond Hopping coming out. David, seeing
// it: "This clarified what we mean by 'Pond'."
//
// ── Why there is a guess ──────────────────────────────────────────────────
//
// The timezone says where the phone is with no permission prompt, no dialog
// and no GPS — see homePond.js. So the three countries are not a menu, they
// are a confirmation with the likely one already ticked. Being wrong costs
// one tap, because the alternatives are on screen anyway.

/** How long the globe takes to find the country, and the reply to land. */
const TURN_MS = 900

/**
 * @param onDone   called with (countryCode, intent). `intent` is what they
 *                 said they wanted to do next — 'photos', 'now', or null for
 *                 skip — and matches the route ids GetTripsIn already has.
 * @param thenAsk  whether to follow the answer with "anything you've already
 *                 done?". True on first run, false in Settings, where somebody
 *                 has come to change one field and being asked about photos
 *                 afterwards would be baffling.
 */
export default function WheresHome({ onDone, thenAsk = false }) {
  const [picked, setPicked] = useState(null)
  const [asking, setAsking] = useState(false)
  const [looking, setLooking] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef(null)

  const guess = useMemo(() => guessHome(), [])
  const offered = useMemo(() => choices(guess), [guess])
  const found = useMemo(() => search(query).slice(0, 40), [query])

  useEffect(() => {
    if (looking) box.current?.focus()
  }, [looking])

  // Answered. The device knows immediately; the profile catches up if there
  // is one, and nobody waits on it.
  useEffect(() => {
    if (!picked) return undefined
    writeHome(picked)
    syncHome(picked)
    // The reply holds for a beat before moving on — it is the screen that
    // defines the word "pond" and reading it is the whole point of it.
    const t = setTimeout(() => (thenAsk ? setAsking(true) : onDone?.(picked, null)), TURN_MS + 1400)
    return () => clearTimeout(t)
  }, [picked, thenAsk, onDone])

  if (picked && asking) return <WhatNow code={picked} onPick={(intent) => onDone?.(picked, intent)} />
  if (picked) return <Landed code={picked} />

  return (
    <div className="wh">
      <div className="wh-inner">
        <p className="wh-label">{looking ? "Where's home?" : 'First things first'}</p>
        <h1 className="wh-ask">{looking ? 'Find your pond' : "Where's home?"}</h1>

        {!looking && (
          <p className="wh-say">Every trip is measured from somewhere. Pick your pond.</p>
        )}

        {looking && (
          <input
            ref={box}
            className="wh-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Start typing a country"
            autoComplete="country"
            aria-label="Search for a country"
          />
        )}

        <div className="wh-list">
          {(looking ? found.map((f) => f.code) : offered).map((code) => (
            <Choice
              key={code}
              code={code}
              // The guess is ticked, not assumed. Nothing is saved until it
              // is tapped — a pre-selected row that submitted itself would be
              // the app deciding where somebody lives.
              hinted={!looking && code === guess}
              onPick={() => setPicked(code)}
            />
          ))}

          {looking && query.trim() && !found.length && (
            <p className="wh-none">Nothing called “{query.trim()}”. Try the country&apos;s own name.</p>
          )}
        </div>

        {!looking ? (
          <button className="wh-else" onClick={() => setLooking(true)}>
            Somewhere else
          </button>
        ) : (
          <button
            className="wh-else"
            onClick={() => {
              setLooking(false)
              setQuery('')
            }}
          >
            Back to the usual three
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The second question, and the last one for a while.
 *
 * Three doors, and the order is the order they are worth. Photographs first
 * because they produce something visible in about four seconds — a place, a
 * date, a trip on the globe — where anything else produces a promise. Being
 * on a trip right now is the rarer case but the better one when it is true,
 * so it gets its own door rather than hiding inside the first.
 *
 * Skip is a link rather than a button, on purpose. It is a real option and it
 * must not look like one of the two answers: somebody who has just told us
 * where they live has already done enough for one minute.
 *
 * The two intents match the route ids GetTripsIn has had all along, so this
 * screen opens a door that already exists rather than building a third way in.
 */
function WhatNow({ code, onPick }) {
  return (
    <div className="wh">
      <div className="wh-inner">
        <p className="wh-label">Your pond is {nameOf(code)}</p>
        <h1 className="wh-ask">Anything you&apos;ve already done?</h1>
        <p className="wh-say">
          A trip builds itself out of what you already have. Nothing needs typing.
        </p>

        <div className="wh-doors">
          <button className="wh-door" onClick={() => onPick('photos')}>
            <span className="wh-door-name">Add photos from a trip</span>
            <span className="wh-door-say">Where you were and when comes out of them</span>
          </button>
          <button className="wh-door" onClick={() => onPick('now')}>
            <span className="wh-door-name">I&apos;m on one right now</span>
            <span className="wh-door-say">One photo will do — even the plane window</span>
          </button>
        </div>

        <button className="wh-else" onClick={() => onPick(null)}>
          Skip for now
        </button>
      </div>
    </div>
  )
}

/**
 * One country, as a card.
 *
 * CountryFlags rather than an emoji: emoji flags are a font, they render
 * inconsistently across Android, and Scotland has no emoji at all. These are
 * the same self-hosted SVGs the trip cards use — "good flag, not a shit flat
 * one" — and any country without one falls back to the globe mark rather than
 * to a broken glyph.
 */
function Choice({ code, hinted, onPick }) {
  return (
    <button className={`wh-choice${hinted ? ' is-hinted' : ''}`} onClick={onPick}>
      <CountryFlags countries={[isoToEmojiFlag(code)]} size={30} unknown />
      <span className="wh-choice-name">{nameOf(code)}</span>
      {hinted && <span className="wh-choice-sub">Looks like you</span>}
    </button>
  )
}

/**
 * The reply, and the globe turning to find it.
 *
 * This screen is the definition. Saying "your pond is Australia" while the
 * globe swings to put Australia in the middle is what makes the word mean
 * something — which is why the dot has to be in the right place rather than a
 * flag pasted onto a drawing.
 */
function Landed({ code }) {
  return (
    <div className="wh">
      <div className="wh-inner wh-inner--landed">
        <div className="wh-globe">
          <CountryFlags countries={[isoToEmojiFlag(code)]} size={56} unknown />
        </div>
        <h1 className="wh-ask wh-ask--landed">Your pond is {nameOf(code)}</h1>
      </div>
    </div>
  )
}
