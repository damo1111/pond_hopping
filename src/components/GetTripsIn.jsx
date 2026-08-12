import { useContext, useState } from 'react'
import { useAuth } from '../lib/AuthContext.jsx'
import { TripContext } from '../App.jsx'
import { track } from '../lib/analytics.js'
import StartFromPhotos from './StartFromPhotos.jsx'
import StartNow from './StartNow.jsx'
import StartFromTimeline from './StartFromTimeline.jsx'
import StartFromPaste from './StartFromPaste.jsx'
import ConnectAI from './ConnectAI.jsx'
import SheetGrip from './SheetGrip.jsx'

// Every road into this app already existed. Every one of them was behind a
// trip you hadn't created yet, so this screen was built to gather them: six
// routes, each with a title and a paragraph, one hundred and fifty words, and
// two buttons at the bottom whose only job was to let you leave.
//
// Six things all asking to be read is the same as none of them being read.
// The paragraphs were doing the work of a manual for somebody who has been
// in the app for ninety seconds, and the one route that matters most —
// photographs, the only door that fits a trip already taken, which is most of
// anyone's travel — was the second row of a list.
//
// So: photos becomes *the* thing rather than a row. "I'm on one right now"
// sits under it, because it is the only route with a deadline. The other four
// keep their names and lose their paragraphs — nothing has been removed, and
// the retired words are in docs/copy-parked.md with the reasoning.
//
// The ground is paper rather than white. The cards were white on a white
// sheet, which is why the padding read as broken: with no edge to sit inside,
// space around a thing looks like space *between* things.

const INBOX = import.meta.env.VITE_BOOKINGS_INBOX || 'bookings@eend.app'

/**
 * The whole argument for the app, drawn once.
 *
 * A pile of snapshots on the left, a line of travel on the right, and the
 * thing in the middle is the app. Said in a picture because the sentence
 * version of it — "we read the dates out of your photographs and reconstruct
 * the journey" — is the paragraph this screen just deleted.
 */
function PhotosToTrip() {
  // The viewBox is cropped tight to the drawing: the 240×84 grid the shapes
  // were laid out on left a band of empty tint above and below them.
  return (
    <svg className="gti-draw" viewBox="4 15 232 52" aria-hidden="true" focusable="false">
      <g className="gti-pile">
        <rect x="12" y="28" width="42" height="34" rx="5" transform="rotate(-10 33 45)" />
        <rect x="20" y="24" width="42" height="34" rx="5" transform="rotate(5 41 41)" />
        <rect className="gti-pile-top" x="26" y="26" width="42" height="34" rx="5" />
      </g>
      {/* Inside the top snapshot: a sun and a horizon, entirely within the
          rectangle's own bounds so it needs no clip path to stay put. */}
      <circle className="gti-sun" cx="38" cy="37" r="4" />
      <path className="gti-hill" d="M29 53 Q39 44 47 51 T64 50" />

      <path className="gti-arrow" d="M80 43 H100" />
      <path className="gti-arrow-head" d="M96 39 L101 43 L96 47" />

      <path
        className="gti-route"
        d="M116 58 C132 38 146 30 160 34 S198 55 214 42"
      />
      <circle className="gti-pin" cx="116" cy="58" r="3.5" />
      <circle className="gti-pin" cx="160" cy="34" r="3.5" />
      <circle className="gti-pin gti-pin--last" cx="214" cy="42" r="4.5" />
    </svg>
  )
}

export default function GetTripsIn({ onClose, onCreated, mcpUrl }) {
  const { user } = useAuth()
  const { openAuth } = useContext(TripContext)
  const [route, setRoute] = useState(null)
  // The trip that was made, not merely that one was — so closing this can
  // open it instead of dropping you back on the globe to find it.
  const [made, setMade] = useState(null)
  const [copied, setCopied] = useState(null)

  async function copy(what, text) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      /* a browser that won't copy still shows the text */
    }
  }

  // Made, but not yet acted on. The parent's response to a new trip is to
  // reload the globe, which tears this sheet down — so it is held until the
  // sheet is dismissed. Otherwise the screen that says what happened, and
  // offers to record the rest of the trip, is destroyed the instant it
  // renders and nobody ever sees either.
  //
  // Signed out, every one of these ends at the same wall — the insert fails
  // because there is nobody to own the trip. Better to ask at the door than
  // to let somebody pick forty photos and read the dates out of them first.
  // This is also why the sheet no longer carries a "Create an account" block:
  // the ask arrives when it has a reason, attached to the thing they chose.
  const gate = (what, go) => () => {
    track('route_taken', { route: what, signed_in: !!user })
    if (user) go()
    else openAuth?.()
  }

  // Which door this came through, along with the trip. "Have a look" after
  // uploading three hundred photographs and "I'm off now" want different
  // things to happen next, and only the caller can do either.
  const close = () => {
    const came = route
    setRoute(null)
    if (made) onCreated?.(made, came)
    else onClose?.()
  }

  if (route === 'now') {
    return <StartNow onDone={(t) => setMade(t ?? true)} onClose={close} />
  }

  if (route === 'photos') {
    return <StartFromPhotos onDone={(t) => setMade(t ?? true)} onClose={close} />
  }

  if (route === 'timeline') {
    return <StartFromTimeline onDone={(t) => setMade(t ?? true)} onClose={close} />
  }

  if (route === 'paste') {
    return <StartFromPaste onDone={(t) => setMade(t ?? true)} onClose={close} />
  }

  if (route === 'ai') {
    return <ConnectAI url={mcpUrl} onClose={close} />
  }

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet gti" onClick={(e) => e.stopPropagation()}>
        <SheetGrip onClose={onClose} />

        {/* Photos, at the size of its importance.
            The second line is the one thing people don't believe until told:
            they can empty a whole camera roll in here — several holidays at
            once — and get trips back rather than one enormous smear. It is
            true, and it has been true for a while; tripFromPhotos splits on a
            four-day gap. It had simply never been said out loud. */}
        <button
          className="gti-hero gti-in"
          style={{ '--in': 1 }}
          onClick={gate('photos', () => setRoute('photos'))}
        >
          <span className="gti-hero-art">
            <PhotosToTrip />
          </span>
          <span className="gti-hero-title">Start from photos</span>
          <span className="gti-hero-body">
            Chuck in everything. I&apos;ll sort it into trips.
          </span>
        </button>

        {/* Second, because it is the only one with a deadline. Every other
            route here can be taken next month and lose nothing; this one is
            for somebody leaving today, and the days they don't record are
            simply gone. */}
        <button
          className="gti-now gti-in"
          style={{ '--in': 2 }}
          onClick={gate('now', () => setRoute('now'))}
        >
          <span className="gti-now-live" aria-hidden="true" />
          <span className="gti-now-text">
            <span className="gti-now-title">I&apos;m on one right now</span>
            <span className="gti-now-body">Starts today, fills itself in</span>
          </span>
        </button>

        {/* And the rest, by name. A route somebody is looking for is found by
            its name; a route they aren't looking for is not sold by a
            paragraph. Timeline keeps its explanation because it is the only
            one whose name doesn't say what it does — and it is the one that
            can bring back years in a single go. */}
        <div className="gti-rest gti-in" style={{ '--in': 3 }}>
          <button className="gti-quiet" onClick={() => copy('inbox', INBOX)}>
            <span className="gti-quiet-name">Forward a booking</span>
            <span className="gti-quiet-hint">{copied === 'inbox' ? 'Copied' : INBOX}</span>
          </button>

          <button className="gti-quiet" onClick={gate('timeline', () => setRoute('timeline'))}>
            <span className="gti-quiet-name">Google Timeline</span>
            <span className="gti-quiet-hint">Years of trips, in one file</span>
          </button>

          <button className="gti-quiet" onClick={gate('paste', () => setRoute('paste'))}>
            <span className="gti-quiet-name">Paste a confirmation</span>
            <span className="gti-quiet-hint">Flight, hotel, train</span>
          </button>

          {mcpUrl && (
            <button className="gti-quiet" onClick={gate('ai', () => setRoute('ai'))}>
              <span className="gti-quiet-name">Let your AI do it</span>
              <span className="gti-quiet-hint">Claude, ChatGPT or Gemini</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
