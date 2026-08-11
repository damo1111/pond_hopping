import { useState } from 'react'
import ReceiptScan from './ReceiptScan.jsx'
import FindDuplicates from './FindDuplicates.jsx'
import TripStory from './TripStory.jsx'

// Three things you can do to a trip's photographs, on one line.
//
// They were three full-width cards stacked down the page, each with its own
// button and its own paragraph explaining itself — "Reads each one and offers
// what it finds as a cost. Nothing is saved until you say." That copy is
// worth reading once and then never again, and until you scrolled past all
// of it you could not see a single photograph. On a phone that was most of a
// screen spent on things nobody taps twice.
//
// So: one row, three short labels, and the explanation appears when you
// choose the thing rather than before. Receipts and duplicates start on the
// tap — the row's button is the trigger, which is why both take `autoStart`
// — and the story, which is the one that costs money, only ever runs from
// its own explicit tap.
const TOOLS = [
  { id: 'receipts', label: 'Receipts', why: 'Reads each photograph and offers what it finds as a cost. Nothing is saved until you say.' },
  { id: 'duplicates', label: 'Duplicates', why: 'Compares the pictures themselves, here in this browser. Nothing is sent anywhere, and nothing is removed until you say.' },
  { id: 'story', label: 'Write again', why: 'Reads anything new and writes the trip up from scratch. A few minutes — stay on the app while it runs.' },
]

export default function TripTools({ trip, photos = [], onDone }) {
  const [open, setOpen] = useState(null)
  // Bumped rather than set, so tapping "Write again" twice runs it twice.
  const [runKey, setRunKey] = useState(0)

  function tap(id) {
    if (id === 'story') {
      setOpen('story')
      setRunKey((n) => n + 1)
      return
    }
    setOpen((now) => (now === id ? null : id))
  }

  const chosen = TOOLS.find((t) => t.id === open)

  return (
    <div className="tools">
      <div className="tools-row">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tools-btn${open === t.id ? ' on' : ''}`}
            onClick={() => tap(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {chosen && open !== 'story' && <div className="tools-why">{chosen.why}</div>}

      {open === 'receipts' && (
        <ReceiptScan trip={trip} photos={photos} onDone={onDone} autoStart />
      )}
      {open === 'duplicates' && <FindDuplicates photos={photos} onDone={onDone} autoStart />}

      {/* Always mounted, whichever tool is open. It has to be: it starts
          itself when photographs arrive, it holds the questions, and it
          carries the story somebody came back to read. Hiding it behind a
          tab would mean none of that happens unless you go looking. */}
      <TripStory trip={trip} photos={photos} runKey={runKey} />
    </div>
  )
}
