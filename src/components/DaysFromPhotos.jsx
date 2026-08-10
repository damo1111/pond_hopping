import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { daysFrom, describeDay, draftEntry } from '../lib/photoDays.js'

// Three hundred photographs are already a day-by-day account of where
// somebody went — written down by the camera at the time, which is better
// evidence than anybody's memory of a weekend two years ago.
//
// This offers that account as journal days. Every line of it is arithmetic
// on timestamps and coordinates: how many photographs, between which
// hours, in how many places, and which stop lasted longest. Nothing here
// looks at what is in a picture or has an opinion about the day, and every
// entry it writes says on its face that it was reconstructed rather than
// written at the time. That is David's own stance from the New Orleans
// trip, and it is the difference between a useful skeleton and a machine
// pretending to remember your holiday.

export default function DaysFromPhotos({ trip, photos = [], onDone }) {
  const [already, setAlready] = useState(null)
  const [take, setTake] = useState(() => new Set())
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [trouble, setTrouble] = useState(null)
  const [saved, setSaved] = useState(0)

  const days = daysFrom(photos, trip)

  useEffect(() => {
    if (!trip?.id) return
    let alive = true
    supabase
      .from('journal_entries')
      .select('entry_date')
      .eq('trip_id', trip.id)
      .then(({ data }) => alive && setAlready(new Set((data ?? []).map((r) => r.entry_date))))
    return () => {
      alive = false
    }
  }, [trip?.id, saved])

  // Only the days that have nothing written on them. A day already
  // journalled is a day somebody wrote about, and offering to paste a
  // timestamp summary over it is not an improvement.
  const fresh = already ? days.filter((d) => !already.has(d.date)) : []

  useEffect(() => {
    if (already) setTake(new Set(days.filter((d) => !already.has(d.date)).map((d) => d.date)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [already, photos.length])

  async function save() {
    setSaving(true)
    setTrouble(null)
    const rows = fresh.filter((d) => take.has(d.date)).map((d) => draftEntry(d, trip))
    const { error } = await supabase.from('journal_entries').insert(rows)
    setSaving(false)
    if (error) return setTrouble(`Couldn't write them: ${error.message}`)
    setOpen(false)
    setSaved((n) => n + 1)
    onDone?.(rows.length)
  }

  if (!trip?.id || !already) return null
  if (!days.length) return null

  if (!fresh.length) {
    return (
      <div className="dfp">
        <div className="dfp-note">
          Every day these photographs cover already has a journal entry.
        </div>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="dfp">
        <button className="dfp-go" onClick={() => setOpen(true)}>
          Piece together {fresh.length} day{fresh.length === 1 ? '' : 's'} from these photos
        </button>
        <div className="dfp-note">
          Built from the times and places in the photographs — where you were and how long for.
          Not a diary, and it says so.
        </div>
      </div>
    )
  }

  return (
    <div className="dfp dfp--review">
      <div className="dfp-head">{fresh.length} day{fresh.length === 1 ? '' : 's'} the photographs can account for</div>

      {fresh.map((day) => (
        <label key={day.date} className="dfp-day">
          <input
            type="checkbox"
            checked={take.has(day.date)}
            onChange={() =>
              setTake((set) => {
                const next = new Set(set)
                next.has(day.date) ? next.delete(day.date) : next.add(day.date)
                return next
              })
            }
          />
          <span className="dfp-what">
            <span className="dfp-when">
              Day {day.day_number} · {new Date(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
            <span className="dfp-said">{describeDay(day)}</span>
          </span>
        </label>
      ))}

      {trouble && <div className="dfp-trouble">{trouble}</div>}

      <div className="dfp-actions">
        <button className="dfp-cancel" onClick={() => setOpen(false)}>
          not now
        </button>
        <button className="dfp-save" disabled={!take.size || saving} onClick={save}>
          {saving ? 'writing…' : `Add ${take.size} to the journal`}
        </button>
      </div>
      <div className="dfp-note dfp-note--left">
        Each one is tagged “reconstructed” and carries a line saying it was built from the
        photographs rather than written at the time. Edit any of them afterwards — they are
        ordinary journal entries once they are in.
      </div>
    </div>
  )
}
