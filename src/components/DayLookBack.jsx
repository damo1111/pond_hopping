import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import SheetGrip from './SheetGrip.jsx'
import { SUBJECTS } from '../lib/dayLookBack.js'

// The room behind the nine o'clock notification.
//
// The push is one line — "15.2 km. Waddled." — and one line is all a lock
// screen should ever be. This is what is behind it, and the reason it is
// worth opening: the counts the line was drawn from, and the day laid out
// in the order it happened.
//
// ── Why it reads a row rather than working it out ─────────────────────
//
// The arithmetic was already done, on a server, at nine in the evening, and
// written into `day_look_backs.facts`. Recomputing it here would mean
// pulling three hundred photographs onto a phone to arrive at the same
// numbers — and, worse, possibly *different* ones: a photograph added
// tomorrow would silently change what last night said. The row is a record
// of an evening, not a live query, and it should read like one.
//
// So this screen cannot exist before the push does, which is correct. There
// is no "look back at today" button, because today is not over.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "Friday 4 April" — the day, said the way somebody would say it. */
function dayName(date) {
  const d = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()]
  return `${weekday} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** The counts, as chips. Ordered as `ranked` already is: biggest first. */
function Tally({ facts }) {
  const rows = (facts.ranked ?? []).filter((r) => r.n > 0).slice(0, 6)
  if (!rows.length) return null
  return (
    <div className="look-tally">
      {rows.map((r) => (
        <div className="look-chip" key={r.subject}>
          <span className="look-chip-n">{r.n}</span>
          <span className="look-chip-word">{r.word ?? SUBJECTS[r.subject]?.many ?? r.subject}</span>
        </div>
      ))}
    </div>
  )
}

export default function DayLookBack({ tripId, date, title, onClose }) {
  const [row, setRow] = useState(undefined)

  useEffect(() => {
    let alive = true
    setRow(undefined)
    supabase
      .from('day_look_backs')
      .select('on_date, line, facts')
      .eq('trip_id', tripId)
      .eq('on_date', date)
      .maybeSingle()
      .then(({ data }) => alive && setRow(data ?? null))
    return () => {
      alive = false
    }
  }, [tripId, date])

  const facts = row?.facts ?? null

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet look-sheet" onClick={(e) => e.stopPropagation()}>
        <SheetGrip onClose={onClose} />

        <div className="ios-sheet-title">{dayName(date)}</div>
        {title && <div className="ios-sheet-sub">{title}</div>}

        {row === undefined && <div className="look-quiet">Looking it up…</div>}

        {/* Signed in as somebody else, or opened on a device the evening was
            never sent to. Row-level security means an evening that is not
            yours simply is not there, which is the right answer and a
            confusing screen unless it says so. */}
        {row === null && <div className="look-quiet">That evening isn’t on this account.</div>}

        {facts && (
          <>
            {/* The same sentence that was on the lock screen, so opening it
                confirms rather than replaces what they already read. */}
            <p className="look-line">{row.line}</p>

            <div className="look-numbers">
              {facts.photographs > 0 && (
                <div className="look-number">
                  <b>{facts.photographs}</b>
                  <span>{facts.photographs === 1 ? 'photograph' : 'photographs'}</span>
                </div>
              )}
              {facts.km_on_foot > 0 && (
                <div className="look-number">
                  <b>{facts.km_on_foot}</b>
                  {/* groundCovered() is a floor and says so, so this does
                      not claim to be a total. */}
                  <span>km, at least</span>
                </div>
              )}
              {facts.from && facts.to && (
                <div className="look-number">
                  <b>{facts.from}</b>
                  <span>until {facts.to}</span>
                </div>
              )}
            </div>

            {facts.first_time?.length > 0 && (
              <p className="look-new">
                First time in {facts.first_time.slice(0, 3).join(', ')}.
              </p>
            )}

            {facts.legs?.length > 0 && (
              <ul className="look-list">
                {facts.legs.map((l, i) => (
                  <li key={`${l.number ?? 'leg'}-${i}`}>
                    {l.from && l.to ? `${l.from} → ${l.to}` : 'A flight'}
                    {l.number ? ` · ${l.number}` : ''}
                  </li>
                ))}
              </ul>
            )}

            {facts.activities?.length > 0 && (
              <ul className="look-list">
                {facts.activities.map((a, i) => (
                  <li key={i}>{a.km ? `${a.km} km ${a.kind ?? 'run'}` : (a.kind ?? 'a run')}</li>
                ))}
              </ul>
            )}

            <Tally facts={facts} />

            {/* What the seeing pass actually wrote down, in the order it
                happened. This is the part that is worth opening: a count is
                a fact about a pile, and "a broad avenue centred on a distant
                dome" is the day. Capped, because a sheet is not a gallery. */}
            {facts.observations?.length > 0 && (
              <ol className="look-day">
                {facts.observations.slice(0, 12).map((o, i) => (
                  <li key={i}>
                    {o.at && <span className="look-at">{o.at}</span>}
                    <span className="look-what">{o.what}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  )
}
