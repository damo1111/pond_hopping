import { useState } from 'react'
import ReceiptScan from './ReceiptScan.jsx'
import FindDuplicates from './FindDuplicates.jsx'
import TripStory from './TripStory.jsx'
import BeforeWeWrite from './BeforeWeWrite.jsx'
import { supabase } from '../lib/supabase.js'
import { whatThereIs } from '../lib/storyBuild.js'
import { worthAsking } from '../lib/whatWeHave.js'

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

export default function TripTools({ trip, photos = [], onDone, onGet }) {
  const [open, setOpen] = useState(null)
  // Bumped rather than set, so tapping "Write again" twice runs it twice.
  const [runKey, setRunKey] = useState(0)
  // What the trip has, asked for only when somebody presses write.
  const [asking, setAsking] = useState(null)

  const write = () => {
    setAsking(null)
    setOpen('story')
    setRunKey((n) => n + 1)
  }

  async function tap(id) {
    if (id !== 'story') return setOpen((now) => (now === id ? null : id))

    // Before the writing, not after — after, the answer is "well, it is
    // written now". The app will write a trip up from photographs alone and
    // never mention that the booking inbox, the Timeline export and the runs
    // were sitting there unused, so the story comes out thinner than it had
    // to be and nobody knows why.
    //
    // Counted here rather than trusting what this screen happens to hold:
    // the question is about the whole trip, and this component only ever
    // sees its photographs.
    const [entries, flights, runs, tracks] = await Promise.all([
      supabase.from('journal_entries').select('note,built_from').eq('trip_id', trip.id),
      supabase.from('flights').select('id').eq('trip_id', trip.id),
      supabase.from('runs').select('id').eq('trip_id', trip.id),
      supabase.from('day_tracks').select('track_date,visits').eq('trip_id', trip.id),
    ])
    const facts = whatThereIs({
      photos,
      entries: entries.data ?? [],
      flights: flights.data ?? [],
      runs: runs.data ?? [],
      tracks: tracks.data ?? [],
    })

    // Only when there is something worth asking about. A trip with the lot
    // does not need a screen telling it so, and a trip with nothing cannot
    // be written either way.
    if (worthAsking(facts)) setAsking(facts)
    else write()
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

      {asking && (
        <BeforeWeWrite
          facts={asking}
          onWrite={write}
          onGet={(route) => {
            setAsking(null)
            onGet?.(route)
          }}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  )
}
