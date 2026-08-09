import { useContext, useState } from 'react'
import { useAuth } from '../lib/AuthContext.jsx'
import { TripContext } from '../App.jsx'
import StartFromPhotos from './StartFromPhotos.jsx'
import StartFromTimeline from './StartFromTimeline.jsx'
import SheetGrip from './SheetGrip.jsx'

// Every road into this app already existed. Every one of them was behind a
// trip you hadn't created yet.
//
// The Gmail scan is real and good and lives inside an existing trip's planner.
// The forwarding address was mentioned once, during onboarding, and never
// again. The MCP connector URL is in Account, under a heading nobody reads
// when they're new. Photos could only be added to a trip that already had a
// name and dates — which is exactly backwards for a trip you've already
// taken, where the photos *are* the trip.
//
// So this is one screen with all of them on it, reachable from the empty
// globe and from Plan. Nothing here is new capability; it is the door.

const INBOX = import.meta.env.VITE_BOOKINGS_INBOX || 'bookings@eend.app'

export default function GetTripsIn({ onClose, onCreated, mcpUrl }) {
  const { user } = useAuth()
  const { openAuth } = useContext(TripContext)
  const [route, setRoute] = useState(null)
  const [made, setMade] = useState(false)
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
  // Signed out, every one of these ends at the same wall — the insert fails
  // because there is nobody to own the trip. Better to ask at the door than
  // to let somebody pick forty photos and read the dates out of them first.
  const gate = (go) => () => (user ? go() : openAuth?.())

  const close = () => {
    setRoute(null)
    if (made) onCreated?.()
    else onClose?.()
  }

  if (route === 'photos') {
    return <StartFromPhotos onDone={() => setMade(true)} onClose={close} />
  }

  if (route === 'timeline') {
    return <StartFromTimeline onDone={() => setMade(true)} onClose={close} />
  }

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet routes-sheet" onClick={(e) => e.stopPropagation()}>
        <SheetGrip onClose={onClose} />
        <div className="ios-sheet-title">Get your trips in</div>
        <div className="ios-sheet-sub">
          However you'd rather do it. Any one of these is enough to start — the rest can come
          later.
        </div>

        {/* First because it is the only one that works for a trip you have
            already taken, which is most of anyone's travel. */}
        <button className="route" onClick={gate(() => setRoute('photos'))}>
          <span className="route-icon">🖼</span>
          <span className="route-text">
            <span className="route-title">Start from photos</span>
            <span className="route-body">
              A trip you've taken, or one you're on. I read the dates out of the photos and build
              the trip around them. Shrunk on your phone first, so it's quick.
            </span>
          </span>
        </button>

        {/* Second because it is the only one that does the whole back
            catalogue at once — and the only one that needs no permission,
            no photos still on the phone, and works the same on Android. */}
        <button className="route" onClick={gate(() => setRoute('timeline'))}>
          <span className="route-icon">🗺</span>
          <span className="route-text">
            <span className="route-title">Bring your Google Timeline in</span>
            <span className="route-body">
              If Google has been keeping your timeline, every trip you've taken is already in it.
              Export it, drop the file here, and pick the ones worth keeping. It's read on your
              phone — nothing is sent until you've ticked them.
            </span>
          </span>
        </button>

        <a className="route" href="mailto:?to=&subject=Fwd:%20booking" onClick={(e) => e.preventDefault()}>
          <span className="route-icon">📧</span>
          <span className="route-text">
            <span className="route-title">Forward a booking</span>
            <span className="route-body">
              Send any confirmation — flight, hotel, restaurant — to this address and it turns
              into an itinerary. Forward a few old ones and your history builds itself.
            </span>
            <span
              className="route-copy"
              role="button"
              tabIndex={0}
              onClick={() => copy('inbox', INBOX)}
              onKeyDown={(e) => e.key === 'Enter' && copy('inbox', INBOX)}
            >
              {copied === 'inbox' ? 'Copied' : INBOX}
            </span>
          </span>
        </a>

        <button className="route" onClick={gate(() => onClose?.('plan'))}>
          <span className="route-icon">📋</span>
          <span className="route-text">
            <span className="route-title">Paste a confirmation</span>
            <span className="route-body">
              Copy a booking email into Plan and it pulls out the flights, stays and bookings.
              Nothing to set up.
            </span>
          </span>
        </button>

        {mcpUrl && (
          <button className="route" onClick={() => copy('mcp', mcpUrl)}>
            <span className="route-icon">✨</span>
            <span className="route-text">
              <span className="route-title">Let your AI do it</span>
              <span className="route-body">
                Add Pond Hopping to Claude, ChatGPT or Gemini, then ask it to go through your
                inbox and add your trips. It already has your email — we never need it.
              </span>
              <span className="route-copy">{copied === 'mcp' ? 'Copied' : 'Copy connector URL'}</span>
            </span>
          </button>
        )}

        {/* The ask, rather than a note about the ask. This was a grey
            sentence at the bottom and a "Not now" button — which is to say,
            the only call to action on the screen was to leave. */}
        {!user ? (
          <>
            <div className="route-cta">
              <div className="route-cta-line">Any of these need somewhere to put it.</div>
              <div className="route-cta-sub">
                An email address and a six-digit code. No password, nothing to remember.
              </div>
              <button className="ios-sheet-done" onClick={() => openAuth?.()}>
                Create an account
              </button>
            </div>
            <button className="account-btn ghost" onClick={onClose}>
              Have a look round first
            </button>
          </>
        ) : (
          <button className="account-btn ghost" onClick={onClose}>
            Not now
          </button>
        )}
      </div>
    </div>
  )
}
