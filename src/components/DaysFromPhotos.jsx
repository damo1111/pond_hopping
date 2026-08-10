import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { thumb } from '../lib/imgTransform.js'
import { RECONSTRUCTED, daysFrom, entryFor, namesForDay, priceIt, sift, stopKey, tellDay, titleDay } from '../lib/tripStory.js'
import { TRUST_PHOTO } from '../lib/tripStory.js'

// Piecing a trip together from photographs taken two years ago.
//
// Coordinates first, pictures only where coordinates run out. On a
// three-day Roman trip that is around twenty map lookups and a handful of
// photographs actually looked at — as against three hundred, which is what
// asking every photograph what it was would cost, for a worse answer.
//
// The first version of this screen offered "121 photographs between 09:14
// and 21:40" as a day, which was a description of the database rather than
// of Rome. What comes out now is where you were and when, in the names of
// the places, because that is what somebody trying to remember a weekend
// two years ago is actually asking for.

const LOOKUP_BATCH = 40

export default function DaysFromPhotos({ trip, photos = [], onDone }) {
  const [already, setAlready] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | naming | looking | review | saving | done
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [names, setNames] = useState({})
  const [price, setPrice] = useState(null)
  const [take, setTake] = useState(() => new Set())
  const [trouble, setTrouble] = useState(null)
  const [saved, setSaved] = useState(0)
  // Replace entries that already exist. Destructive, so never on by default.
  const [redo, setRedo] = useState(false)

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

  // A day already journalled is a day somebody wrote about, and pasting a
  // reconstruction over it is not an improvement — so by default it is left
  // alone.
  //
  // But "left alone" quietly meant "invisible", and the trip with the most
  // photographs in it is New Orleans, every day of which was written up
  // from a much cruder reconstruction before any of this existed. The best
  // test of the new thing was the one trip it would refuse to touch. So
  // redoing is offered, off by default, saying plainly that it replaces.
  const untouched = already ? days.filter((d) => !already.has(d.date)) : []
  const written = already ? days.filter((d) => already.has(d.date)) : []
  const fresh = redo ? [...untouched, ...written].sort((a, b) => a.date.localeCompare(b.date)) : untouched

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token
  }

  async function piece() {
    setTrouble(null)
    setPhase('naming')
    const auth = await token()
    if (!auth) {
      setTrouble('Sign in first.')
      setPhase('idle')
      return
    }

    // 1. What is at each stop. One lookup per stop, none per photograph.
    const wanted = []
    for (const day of fresh)
      day.stops.forEach((s, i) => {
        if (s.lat != null) wanted.push({ key: stopKey(day.date, i), lat: s.lat, lon: s.lon })
      })

    const candidates = {}
    setProgress({ done: 0, total: wanted.length })
    for (let i = 0; i < wanted.length; i += LOOKUP_BATCH) {
      const slice = wanted.slice(i, i + LOOKUP_BATCH)
      try {
        const r = await fetch('/api/name-places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({ stops: slice }),
        })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `server said ${r.status}`)
        for (const s of (await r.json()).stops ?? []) candidates[s.key] = s.candidates
      } catch (e) {
        setTrouble(`Couldn't look the places up: ${e.message}`)
        setPhase('idle')
        return
      }
      setProgress({ done: Math.min(i + slice.length, wanted.length), total: wanted.length })
    }

    // 2. What the numbers settle, and what they cannot.
    const { names: settled, ask } = sift(fresh, candidates)
    setPrice(priceIt(fresh, ask))

    // 3. The few that need a photograph looked at. This is the only step
    //    that costs anything meaningful, and it runs on a handful of stops.
    const found = { ...settled }
    if (ask.length) {
      setPhase('looking')
      setProgress({ done: 0, total: ask.length })
      for (let i = 0; i < ask.length; i++) {
        const a = ask[i]
        try {
          const r = await fetch('/api/which-place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
            body: JSON.stringify({
              photos: a.photos.map((p) => p.thumb_url || thumb(p.url)),
              candidates: a.shortlist.map((c) => ({ name: c.name, category: c.category })),
            }),
          })
          if (r.ok) {
            const said = await r.json()
            // A hedged guess at a picture is worse than a gap: the gap is
            // honest, and the guess ends up in a journal entry as fact.
            if (said.place && said.confidence >= TRUST_PHOTO) found[a.key] = said.place
          }
        } catch {
          // One stop that will not answer leaves one stop unnamed.
        }
        setProgress({ done: i + 1, total: ask.length })
      }
    }

    setNames(found)
    setTake(new Set(fresh.map((d) => d.date)))
    setPhase('review')
  }

  async function save() {
    setPhase('saving')
    setTrouble(null)
    const days_ = fresh.filter((d) => take.has(d.date))
    const rows = days_.map((d) => entryFor(d, trip, names))

    // Anything being replaced goes first, in one statement, so a day never
    // ends up with two entries on it because the insert succeeded after a
    // half-finished delete.
    const replacing = days_.map((d) => d.date).filter((date) => already.has(date))
    if (replacing.length) {
      const { error } = await supabase
        .from('journal_entries')
        .delete()
        .eq('trip_id', trip.id)
        .in('entry_date', replacing)
      if (error) {
        setPhase('review')
        return setTrouble(`Couldn't replace the old entries: ${error.message}`)
      }
    }

    const { error } = await supabase.from('journal_entries').insert(rows)
    setPhase(error ? 'review' : 'done')
    if (error) return setTrouble(`Couldn't write them: ${error.message}`)
    setSaved((n) => n + 1)
    onDone?.(rows.length)
  }

  if (!trip?.id || !already || !days.length) return null

  if (phase === 'idle' && !fresh.length) {
    return (
      <div className="dfp">
        <div className="dfp-note">
          Every day these photographs cover already has a journal entry.
        </div>
        {written.length > 0 && (
          <label className="dfp-redo">
            <input type="checkbox" checked={redo} onChange={() => setRedo((r) => !r)} />
            <span>
              Write {written.length} of them again from the photographs — this replaces what is
              there now.
            </span>
          </label>
        )}
      </div>
    )
  }

  if (phase === 'idle') {
    const stops = fresh.reduce((n, d) => n + d.stops.filter((s) => s.lat != null).length, 0)
    return (
      <div className="dfp">
        <button className="dfp-go" onClick={piece}>
          Piece together {fresh.length} day{fresh.length === 1 ? '' : 's'}
        </button>
        <div className="dfp-note">
          Works out where you stopped and looks up what is there — {stops} place
          {stops === 1 ? '' : 's'} to check. Only where several things share a spot does it look at
          a photograph to tell them apart.
        </div>
        {written.length > 0 && (
          <label className="dfp-redo">
            <input type="checkbox" checked={redo} onChange={() => setRedo((r) => !r)} />
            <span>
              Also redo {written.length} day{written.length === 1 ? '' : 's'} that already{' '}
              {written.length === 1 ? 'has' : 'have'} an entry — this replaces what is there now.
            </span>
          </label>
        )}
        {trouble && <div className="dfp-trouble">{trouble}</div>}
      </div>
    )
  }

  if (phase === 'naming' || phase === 'looking') {
    return (
      <div className="dfp">
        <div className="dfp-progress">
          {phase === 'naming' ? 'Looking up what is there' : 'Telling apart the crowded spots'}… {progress.done} of{' '}
          {progress.total}
        </div>
        <div className="dfp-bar">
          <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="dfp">
        <div className="dfp-note">That's the trip written up. Edit any day from the Journal.</div>
      </div>
    )
  }

  return (
    <div className="dfp dfp--review">
      <div className="dfp-head">{fresh.length} day{fresh.length === 1 ? '' : 's'}, as far as the photographs can say</div>
      {price && (
        <div className="dfp-note dfp-note--left">
          {price.lookups} place{price.lookups === 1 ? '' : 's'} looked up
          {price.ambiguous
            ? `, and ${price.photosLookedAt} photograph${price.photosLookedAt === 1 ? '' : 's'} looked at where ${price.ambiguous} spot${price.ambiguous === 1 ? ' had' : 's had'} more than one thing on it.`
            : ' — nowhere was crowded enough to need a photograph.'}
        </div>
      )}

      {fresh.map((day) => {
        const mine = namesForDay(day, names)
        return (
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
                Day {day.day_number} ·{' '}
                {new Date(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                {already.has(day.date) && <em className="dfp-replaces"> replaces what is there</em>}
              </span>
              <span className="dfp-title">{titleDay(day, mine)}</span>
              <span className="dfp-said">{tellDay(day, mine)}</span>
            </span>
          </label>
        )
      })}

      {trouble && <div className="dfp-trouble">{trouble}</div>}

      <div className="dfp-actions">
        <button className="dfp-cancel" onClick={() => setPhase('idle')}>
          not now
        </button>
        <button className="dfp-save" disabled={!take.size || phase === 'saving'} onClick={save}>
          {phase === 'saving' ? 'writing…' : `Add ${take.size} to the journal`}
        </button>
      </div>
      <div className="dfp-note dfp-note--left">{RECONSTRUCTED} Edit any of them afterwards.</div>
    </div>
  )
}
