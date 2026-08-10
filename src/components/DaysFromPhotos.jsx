import { useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import { thumb } from '../lib/imgTransform.js'
import { readCache, writeCache } from '../lib/placeCache.js'
import { sweep } from '../lib/staleStory.js'
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
  const { userId } = useContext(TripContext)
  const [entries, setEntries] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | naming | looking | review | saving | done
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [names, setNames] = useState({})
  const [price, setPrice] = useState(null)
  const [take, setTake] = useState(() => new Set())
  const [trouble, setTrouble] = useState(null)
  const [saved, setSaved] = useState(0)
  // Replace entries that already exist. Destructive, so never on by default.
  const [redo, setRedo] = useState(false)
  // Looking at what the photographs say, without any of it being written
  // anywhere. Every day of Rome already has an entry David wrote himself,
  // so the only thing on offer was "replace what is there" — which is the
  // one thing that must not happen to writing like that. Wanting to judge
  // the reconstruction is not the same as wanting to keep it.
  const [previewing, setPreviewing] = useState(false)

  const days = daysFrom(photos, trip)

  useEffect(() => {
    if (!trip?.id) return
    let alive = true
    supabase
      .from('journal_entries')
      .select('entry_date,built_from,edited_at')
      .eq('trip_id', trip.id)
      .then(({ data }) => alive && setEntries(data ?? []))
    return () => {
      alive = false
    }
  }, [trip?.id, saved])

  // Three kinds of day, and they are not the same problem.
  //
  //   fresh — never written up. Offer it.
  //   stale — we wrote it, nobody has edited it, and the photographs have
  //           moved on since. Sweep it up: the story on file describes a
  //           set of pictures that no longer exists.
  //   leave — somebody wrote it themselves, or ours and still accurate.
  //           Never touched without being asked, and `redo` is that ask.
  //
  // Staleness is what the one-shot button missed. Adding forty photographs
  // to a day changes its stops, which changes the story, and nothing said
  // so. Re-telling is nearly free — the arithmetic is instant and the
  // coordinate cache means only genuinely new places cost a lookup — so
  // there is no reason for it not to keep up.
  const { fresh: never, stale, leave } = entries
    ? sweep(days, entries)
    : { fresh: [], stale: [], leave: [] }
  const already = new Set((entries ?? []).map((e) => e.entry_date))
  const written = leave
  const fresh = [...never, ...stale, ...(redo ? leave : [])].sort((a, b) => a.date.localeCompare(b.date))
  // A preview runs over every day, including the ones somebody wrote —
  // those are precisely the ones worth comparing against.
  const target = previewing ? days : fresh

  // Swept up rather than offered. A day whose story we wrote, that nobody
  // has edited, and whose photographs have since changed, is not a decision
  // for anybody to make — the file is simply out of date, and re-telling it
  // costs a few milliseconds of arithmetic and whatever genuinely new
  // coordinates turn up. Runs once per set of photographs, never over an
  // edited day, and never while somebody is mid-review.
  const swept = useRef('')
  useEffect(() => {
    if (!entries || phase !== 'idle' || !stale.length || never.length) return
    const mark = `${trip?.id}:${stale.map((d) => d.date).join(',')}:${photos.length}`
    if (swept.current === mark) return
    swept.current = mark
    piece({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, stale.length, never.length, phase, photos.length])

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token
  }

  async function piece({ silent = false, preview = false } = {}) {
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
    for (const day of target)
      day.stops.forEach((s, i) => {
        if (s.lat != null) wanted.push({ key: stopKey(day.date, i), lat: s.lat, lon: s.lon })
      })

    // Anything already looked up is free. This matters more than it looks:
    // the distances that decide "same place" are exactly the kind of thing
    // that gets tuned after seeing real output, so this gets run again, and
    // a second run should not spend a maps quota re-answering a question
    // about coordinates that have not moved.
    const { hits, misses } = await readCache(wanted, userId)
    const candidates = { ...hits }
    const asked = {}
    setProgress({ done: Object.keys(hits).length, total: wanted.length })

    for (let i = 0; i < misses.length; i += LOOKUP_BATCH) {
      const slice = misses.slice(i, i + LOOKUP_BATCH)
      try {
        const r = await fetch('/api/name-places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
          body: JSON.stringify({ stops: slice }),
        })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `server said ${r.status}`)
        for (const s of (await r.json()).stops ?? []) {
          candidates[s.key] = s.candidates
          asked[s.key] = s.candidates
        }
      } catch (e) {
        setTrouble(`Couldn't look the places up: ${e.message}`)
        setPhase('idle')
        return
      }
      setProgress({
        done: Math.min(Object.keys(hits).length + i + slice.length, wanted.length),
        total: wanted.length,
      })
    }

    // Best effort, and after the answers are already in hand: a cache that
    // fails to save makes the next run slower, not this one wrong.
    await writeCache(misses, asked, userId)

    // 2. What the numbers settle, and what they cannot.
    const { names: settled, ask } = sift(target, candidates)
    setPrice(priceIt(target, ask))

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

    // A sweep does not stop to ask. It is bringing a file back into line
    // with the photographs it was made from, on days nobody has touched.
    if (silent) {
      await write(stale, found, { silent: true })
      return
    }

    setNames(found)
    if (preview) {
      setPhase('preview')
      return
    }

    setTake(new Set(fresh.map((d) => d.date)))
    setPhase('review')
  }

  async function save() {
    setPhase('saving')
    setTrouble(null)
    await write(fresh.filter((d) => take.has(d.date)), names)
  }

  async function write(days_, using, { silent = false } = {}) {
    const rows = days_.map((d) => entryFor(d, trip, using))

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
        setPhase(silent ? 'idle' : 'review')
        if (!silent) setTrouble(`Couldn't replace the old entries: ${error.message}`)
        return
      }
    }

    const { error } = await supabase.from('journal_entries').insert(rows)
    // A sweep leaves no trace on the screen. It brought a file back into
    // line with its own photographs; announcing that with a banner would be
    // the app congratulating itself for not being out of date.
    setPhase(error ? (silent ? 'idle' : 'review') : silent ? 'idle' : 'done')
    if (error) {
      if (!silent) setTrouble(`Couldn't write them: ${error.message}`)
      return
    }
    setSaved((n) => n + 1)
    if (!silent) onDone?.(rows.length)
  }

  if (!trip?.id || !entries || !days.length) return null

  // Read-only. Nothing here has been written and nothing here will be.
  if (phase === 'preview') {
    return (
      <div className="dfp dfp--review">
        <div className="dfp-head">What the photographs say</div>
        <div className="dfp-note dfp-note--left">
          Nothing below has been saved, and nothing will be. This is the reconstruction beside
          what you already wrote, so you can see whether it is any good.
        </div>
        {price && (
          <div className="dfp-note dfp-note--left">
            {price.lookups} place{price.lookups === 1 ? '' : 's'} looked up
            {price.ambiguous
              ? `, and ${price.photosLookedAt} photograph${price.photosLookedAt === 1 ? '' : 's'} looked at where ${price.ambiguous} spot${price.ambiguous === 1 ? ' had' : 's had'} more than one thing on it.`
              : ' — nowhere was crowded enough to need a photograph.'}
          </div>
        )}
        {days.map((day) => {
          const mine = namesForDay(day, names)
          return (
            <div key={day.date} className="dfp-day dfp-day--read">
              <span className="dfp-what">
                <span className="dfp-when">
                  Day {day.day_number} ·{' '}
                  {new Date(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
                <span className="dfp-title">{titleDay(day, mine)}</span>
                <span className="dfp-said">{tellDay(day, mine)}</span>
              </span>
            </div>
          )
        })}
        <div className="dfp-actions">
          <button
            className="dfp-cancel"
            onClick={() => {
              setPreviewing(false)
              setPhase('idle')
            }}
          >
            close
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'idle' && !fresh.length) {
    return (
      <div className="dfp">
        <div className="dfp-note">
          Every day these photographs cover already has a journal entry.
        </div>
        {/* The way to judge this without risking anything. Reading the
            reconstruction and keeping it are different decisions, and only
            one of them can lose somebody's writing. */}
        <button
          className="dfp-go"
          onClick={() => {
            setPreviewing(true)
            piece({ preview: true })
          }}
        >
          Show me what the photographs say
        </button>
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
