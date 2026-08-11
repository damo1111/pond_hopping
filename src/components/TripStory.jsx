import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { traceOf } from '../lib/tripTrace.js'
import { zoneFor } from '../lib/localTime.js'
import { clockIn } from '../lib/localTime.js'
import { BATCH, foldInto, inParallel, readingList } from '../lib/seeing.js'
import {
  alreadyAsked,
  daysAdded,
  asAsked,
  batches,
  confirmed,
  couldNotSay,
  howFar,
  needsLooking,
  spliceChapters,
  stillOpen,
  widerThanADay,
  storyRow,
  theirWords,
  whatItCosts,
  worthAsking,
} from '../lib/storyRun.js'

/** One question, answered in words.
 *
 *  Typing is the main path and the buttons are the way out of it: "I can't
 *  remember" is a real answer and is recorded as one, so the writing admits
 *  the gap instead of inventing something to fill it. */
function Ask({ q, onAnswer, onSkip }) {
  const [said, setSaid] = useState('')
  const [sending, setSending] = useState(false)

  async function send(over) {
    setSending(true)
    await onAnswer(q, over ?? { said: said.trim() })
    setSending(false)
  }

  return (
    <div className="story-ask">
      <div className="story-q">{q.asks}</div>
      {q.because && <div className="story-because">{q.because}</div>}
      <textarea
        className="story-say"
        rows={2}
        placeholder="However much or little you remember…"
        value={said}
        onChange={(e) => setSaid(e.target.value)}
      />
      <div className="story-buttons">
        <button className="story-said" disabled={!said.trim() || sending} onClick={() => send()}>
          {sending ? 'saving…' : 'that was it'}
        </button>
        <button disabled={sending} onClick={() => (onSkip ? onSkip() : send({ verdict: 'unsure' }))}>
          can't remember
        </button>
      </div>
    </div>
  )
}

// The story of a trip, made in three stages, with a question in the middle.
//
// See docs/the-story.md. The short version: look at every photograph once,
// work out what happened from the whole trace rather than a summary of it,
// stop and ask the things only the person who was there can settle, then
// write it — and never over what they wrote themselves.
export default function TripStory({ trip, photos = [], runKey = 0 }) {
  const [step, setStep] = useState('idle')
  // Whether the prose is unfolded. Closed on arrival: this is the photographs
  // screen, and the story is several thousand words of it.
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [trouble, setTrouble] = useState(null)
  const [story, setStory] = useState(null)
  const [questions, setQuestions] = useState([])
  const [reconstruction, setReconstruction] = useState(null)
  const [entries, setEntries] = useState([])
  const [flights, setFlights] = useState([])
  const [runs, setRuns] = useState([])
  const [tracks, setTracks] = useState([])
  const [visits, setVisits] = useState([])
  const [learnVoice, setLearnVoice] = useState(false)
  const [refresh, setRefresh] = useState(0)
  // Whether the story fetch has answered — not whether it found one.
  const [looked, setLooked] = useState(false)

  const mine = photos.filter((p) => p.trip_id === trip?.id)

  useEffect(() => {
    if (!trip?.id) return
    let alive = true
    supabase.from('trip_stories').select('*').eq('trip_id', trip.id).maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        setStory(data ?? null)
        setLooked(true)
      })
    supabase.from('story_questions').select('*').eq('trip_id', trip.id)
      .then(({ data }) => alive && setQuestions(data ?? []))
    supabase.from('journal_entries').select('entry_date,note,built_from').eq('trip_id', trip.id)
      .then(({ data }) => alive && setEntries(data ?? []))
    supabase.from('flights').select('flight_number,dep_airport,arr_airport,dep_time,arr_time').eq('trip_id', trip.id)
      .then(({ data }) => alive && setFlights(data ?? []))
    supabase.from('runs').select('run_date,distance_km,pace,elevation_m,sport').eq('trip_id', trip.id)
      .then(({ data }) => alive && setRuns(data ?? []))
    // Where they were, from whatever was recording. A Google Timeline
    // export lands in day_tracks; the app's own recording lands in
    // location_visits. Neither has ever reached the reconstruction, which
    // is why it kept admitting gaps that something already knew about.
    supabase.from('day_tracks').select('track_date,visits').eq('trip_id', trip.id)
      .then(({ data }) => alive && setTracks(data ?? []))
    supabase.from('location_visits').select('arrived_at,departed_at,lat,lng,source')
      .then(({ data }) => alive && setVisits(data ?? []))
    supabase.from('profiles').select('learn_my_voice').maybeSingle()
      .then(({ data }) => alive && setLearnVoice(!!data?.learn_my_voice))
    return () => {
      alive = false
    }
  }, [trip?.id, refresh])

  // It starts itself, in two passes.
  //
  // The story is worth having the moment there are photographs, and the
  // fast half of it — everything ChatGPT was given, a table of times and
  // coordinates — takes half a minute. So that runs on its own, and then
  // the reading of the photographs runs behind it and rewrites the story
  // with what they showed.
  //
  // This is safe to automate in a way the sweep this replaced was not. That
  // one rewrote journal entries; this writes only to trip_stories, beside
  // somebody's own words and never over them. And photos.seen means a
  // photograph is read once ever, so adding twenty to a trip costs twenty,
  // not two hundred and eighty-six.
  // Photographs that arrived after the story was written.
  //
  // This used to start a rebuild on its own, which was wrong in a way worth
  // writing down: adding one picture to a trip of two hundred and eighty-six
  // re-reconstructed the whole trip and rewrote every chapter of it, twice —
  // once from the trace and once after reading the new photograph. Two of the
  // most expensive calls the app makes, for one frame.
  //
  // And the writing is not deterministic. A story somebody has read, liked
  // and shown to somebody else would come back different, without being
  // asked and without warning, which is a worse failure than the stale text
  // it was fixing. Nobody wants their journal rewritten because they
  // remembered to upload a picture of a menu.
  //
  // So it is offered. The count is honest, the tap is theirs, and the story
  // they have already got stays exactly as it is until they say otherwise.
  //
  // The test is "filed after the story was written" rather than "not yet
  // read": a photograph the vision pass fails on stays unread for ever, and
  // that version would nag, and charge, every time the app was opened.
  const freshDays = daysAdded(mine, story)

  const began = useRef('')
  useEffect(() => {
    // `story` is null while the fetch is in flight as well as when there
    // is none, and starting a run on the first was how a finished story got
    // hidden behind a progress line the moment somebody came back to it.
    if (!looked || !entries) return
    if (!trip?.id || !mine.length || step !== 'idle') return
    // A trip with photographs and no story gets one without being asked,
    // because that is the thing this app does. A trip that already has one
    // gets only the days its new photographs belong to — never the whole
    // thing, and never a chapter nobody's pictures touched.
    if (story && !freshDays.length) return
    const mark = `${trip.id}:${mine.length}:${story?.updated_at ?? 'none'}`
    if (began.current === mark) return
    began.current = mark
    if (story) make({ only: freshDays })
    else itself()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, mine.length, story, freshDays.length, step, entries, looked])

  // "Write again" lives in the row of buttons above, with receipts and
  // duplicates, so that three actions on the same photographs read as three
  // actions rather than three cards. The row bumps this; nothing happens on
  // the first render, only on a change.
  const ranAt = useRef(runKey)
  useEffect(() => {
    if (runKey === ranAt.current) return
    ranAt.current = runKey
    if (step === 'idle') {
      setOpen(true)
      make()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey])

  async function itself() {
    setTrouble(null)
    try {
      const auth = await token()
      if (!auth) return
      const worked = await quickly(auth)
      await write(auth, worked)
      // Then the slow half, on its own, and the story is rewritten when it
      // lands. Nobody waits for this.
      if (needsLooking(mine, 'low').length) await make()
    } catch (e) {
      setTrouble(e.message)
      setStep('idle')
    }
  }

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token
  }

  // "see-photos failed" is what this used to say, about everything, and it
  // cost a round of guessing. A timed-out function does not return JSON at
  // all — Vercel answers with an HTML error page — so .json() threw, the
  // catch swallowed it, and the fallback string was the only thing left.
  //
  // The three failures worth telling apart by name: the function ran out of
  // time, the model refused, and the key is missing. Everything else at
  // least says its status and the first line of what came back.
  async function post(where, body, auth) {
    const r = await fetch(`/api/${where}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify(body),
    })
    if (r.ok) return r.json()

    const said = await r.text().catch(() => '')
    let why = ''
    try {
      why = JSON.parse(said)?.error ?? ''
    } catch {
      // Not JSON. A gateway timeout looks exactly like this.
      why = ''
    }
    if (r.status === 504 || /timed? ?out|FUNCTION_INVOCATION_TIMEOUT/i.test(said)) {
      throw new Error(`${where} ran out of time — it is taking longer than a minute a batch`)
    }
    throw new Error(why || `${where} — ${r.status} ${said.slice(0, 140).replace(/<[^>]*>/g, ' ').trim()}`)
  }

  const zone = zoneFor({
    flights,
    lon: mine.find((p) => p.lon != null)?.lon ?? null,
    when: mine.find((p) => p.taken_at)?.taken_at ?? null,
  })

  /** Stage one, and the expensive one. Every photograph, once, then a
   *  second look only at the frames the first pass said have writing in
   *  them — because at 512 pixels an unreadable sign and no sign look the
   *  same. */
  async function look(auth, detail, only = null) {
    const waiting = needsLooking(mine, detail).filter((p) => !only || only.has(String(p.id)))
    if (!waiting.length) return []
    setStep('looking')
    setTotal(waiting.length)
    setDone(0)

    // Nothing about one batch depends on another, so they do not queue.
    // Twenty-nine sequential calls was minutes of watching a line move.
    const groups = batches(waiting, BATCH)
    const out = await inParallel(
      groups.map((group) => async () => {
        const { seen } = await post(
          'see-photos',
          { photos: group.map((p) => asAsked(p, detail, zone, clockIn)), detail },
          auth
        )
        // Written down as they come back. A run that dies halfway has still
        // paid for what it looked at, and nothing should make somebody buy
        // the same photograph twice.
        await Promise.all(
          (seen ?? []).map((s) => {
            const { id, ...rest } = s ?? {}
            if (!id) return null
            return supabase
              .from('photos')
              .update({ seen: rest, seen_at: new Date().toISOString(), seen_detail: detail })
              .eq('id', id)
          })
        )
        return seen ?? []
      }),
      undefined,
      (i) => setDone((n) => n + groups[i].length)
    )
    return out.flat()
  }

  /**
   * The story, from the trace alone. No photographs looked at.
   *
   * This is the whole of what ChatGPT was given — a table of times and
   * coordinates — and it is where nearly all of the reconstruction comes
   * from. One call, half a minute, a few pence. Putting the image pass in
   * front of it made somebody wait several minutes for a slower version of
   * something that was already available immediately.
   */
  async function quickly(auth) {
    setStep('working it out')
    const seen = mine.filter((p) => p.seen).map((p) => ({ id: p.id, ...p.seen }))
    const trace = foldInto(traceOf(mine, trip, { flights, runs, zone, tracks, visits }), seen)
    const worked = await post('reconstruct-trip', { trace, ...whatWeKnow() }, auth)
    setReconstruction(worked)
    await ask(worked)
    return worked
  }

  /** Everything they have already told us, for the stage that decides what
   *  happened. It used to reach only the writing, which meant the answers
   *  never became part of the reconstruction and the same questions came
   *  back on every run. */
  function whatWeKnow() {
    return {
      // Their own entries, which the reconstruction was working without —
      // so it asked where the trip began about a day they had written up.
      theirs: theirWords(entries),
      answered: confirmed(questions),
      could_not_say: couldNotSay(questions),
      already_asked: stillOpen(questions),
    }
  }

  /** Whatever the reconstruction could not settle becomes a question.
   *
   *  Only once. The same gap in the trace prompts the same doubt on every
   *  run, so without this a re-run files another near-copy of everything it
   *  asked last time — twenty-one questions about a four-day trip, the first
   *  evening near Santa Maria Maggiore asked about three separate times in
   *  three different wordings. The reconstruction is now told what has
   *  already been put to them; this is the second line of defence for when
   *  it asks anyway. */
  async function ask(worked) {
    const asks = (worked.ask ?? []).filter((a) => a?.asks && !alreadyAsked(questions, a))
    if (!asks.length) return false
    const { data } = await supabase
      .from('story_questions')
      .insert(
        asks.map((a) => ({
          trip_id: trip.id,
          on_date: a.on_date || null,
          asks: a.asks,
          because: a.because || null,
        }))
      )
      .select()
    setQuestions((q) => [...q, ...(data ?? [])])
    return true
  }

  /** @param only  dates to rewrite; empty rewrites the whole trip. */
  async function make({ only = [] } = {}) {
    setTrouble(null)
    try {
      const auth = await token()
      if (!auth) throw new Error('Sign in first.')

      const cheap = await look(auth, 'low')
      const already = mine.filter((p) => p.seen).map((p) => ({ id: p.id, ...p.seen }))
      const everything = [...already, ...cheap]

      // The frames worth reading properly. The cheap pass chooses them
      // rather than geometry: the awning is as likely to be in the shot
      // walking up to a place as in the four taken at the table.
      const worth = new Set(readingList(everything, { limit: 60 }).map(String))
      if (worth.size) {
        const second = await look(auth, 'high', worth)
        for (const s of second) {
          const at = everything.findIndex((e) => String(e.id) === String(s.id))
          if (at >= 0) everything[at] = { ...everything[at], ...s }
        }
      }

      setStep('working it out')
      const trace = foldInto(traceOf(mine, trip, { flights, runs, zone, tracks, visits }), everything)
      const worked = await post('reconstruct-trip', { trace, ...whatWeKnow() }, auth)
      setReconstruction(worked)

      // A day-scoped rebuild stays day-scoped only while the trip's own
      // threads hold. If the new photographs changed what the trip was
      // about — a fourth crossing of a square that three chapters call the
      // third — the chapters leaning on it are stale, and the honest answer
      // is to write the trip again rather than leave a sentence that has
      // quietly become untrue.
      const scope = widerThanADay(story?.reconstruction, worked) ? [] : only

      // Anything only they can settle is written down and asked — and then
      // it writes anyway.
      //
      // This used to stop here and wait. It meant a re-run produced no story
      // at all: the reconstruction always finds something to ask about, so
      // the run halted every time on a question nobody had answered, and the
      // last story on file stayed as it was. Four runs over one trip in Rome
      // and not one of them wrote a word — from the outside, a button that
      // did nothing.
      //
      // A question is worth asking. It is not worth withholding the story
      // over. It gets written from what is known, the questions sit above it
      // waiting, and an answer rewrites it.
      await ask(worked)
      await write(auth, worked, scope)
    } catch (e) {
      setTrouble(e.message)
      setStep('idle')
    }
  }

  /** @param only  dates to rewrite; empty means the whole trip. */
  async function write(auth, worked, only = []) {
    setStep('writing')
    const written = await post(
      'write-trip',
      {
        only,
        reconstruction: {
          ...worked,
          // What they told us outranks everything else in here.
          answered: confirmed(questions),
          // And what they were asked but could not say, so a gap is admitted
          // rather than filled.
          could_not_say: couldNotSay(questions),
        },
        theirs: theirWords(entries),
        voice: learnVoice ? entries.filter((e) => !e.built_from).map((e) => e.note).filter(Boolean) : [],
      },
      auth
    )
    const row = storyRow(trip, written, worked, { voice: learnVoice ? 'theirs' : 'narrator' })
    // A day's rewrite is spliced into the story rather than replacing it.
    // The other chapters are kept word for word — they were already read,
    // and the writing is not deterministic enough to redo them for free.
    if (only.length) {
      row.chapters = spliceChapters(story?.chapters ?? [], written.days ?? [])
      row.opening = written.opening ?? story?.opening ?? null
      row.closing = written.closing ?? story?.closing ?? null
    }
    const { error } = await supabase.from('trip_stories').upsert(row, { onConflict: 'trip_id' })
    if (error) throw new Error(error.message)
    setStep('idle')
    setRefresh((n) => n + 1)
  }

  // An open question deserves an open answer.
  //
  // These came back as "What occupied the four-hour break?" and "What were
  // you doing in Piazza Navona for the final hour?", and the screen offered
  // yes, no and can't remember. None of those answers the question. The
  // most valuable thing anybody can give here is a sentence — "a
  // pasta-making course at Eatalian Cooks, then dinner" — and there was
  // nowhere to put it.
  async function answer(q, { said = null, verdict = null } = {}) {
    const row = {
      said: said || null,
      answer: verdict ?? (said ? 'yes' : null),
      answered_at: new Date().toISOString(),
    }
    await supabase.from('story_questions').update(row).eq('id', q.id)
    setQuestions((all) => all.map((x) => (x.id === q.id ? { ...x, ...row } : x)))
  }

  /** Write it again with what they have just told us. The reconstruction is
   *  kept on the story row, so this works after a reload too — otherwise
   *  answering a question the day after it was asked had nothing to write
   *  from. */
  /** Not now. Recorded as unanswered-on-purpose so it stops being asked,
   *  and so the writing admits the gap rather than inventing something. */
  async function skip(q) {
    await answer(q, { verdict: 'unsure' })
  }

  async function carryOn() {
    setTrouble(null)
    try {
      const auth = await token()
      const worked = reconstruction ?? story?.reconstruction
      if (!worked) {
        await make()
        return
      }
      await write(auth, worked)
    } catch (e) {
      setTrouble(e.message)
      setStep('idle')
    }
  }

  if (!trip?.id || !mine.length) return null

  const asking = worthAsking(questions)
  const cost = whatItCosts(mine, 'low')

  // The story is the thing. Progress and questions go with it, never
  // instead of it — leaving the app and coming back should not make three
  // days of writing disappear behind a status line.
  const written = story && (
    <>
      {story.opening && <div className="story-opening">{story.opening}</div>}
      {(story.chapters ?? []).map((c) => (
        <div key={c.date} className="story-chapter">
          <h3>{c.title}</h3>
          <div className="story-when">
            {new Date(c.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div className="story-note">{c.note}</div>
        </div>
      ))}
      {story.closing && <div className="story-closing">{story.closing}</div>}
    </>
  )

  // The questions, wherever the run has got to. They used to appear only
  // during a run, in a state that blocked the writing — so they were both
  // unavoidable and unfindable: gone the moment somebody left the screen,
  // and the story never written until they came back. They belong beside the
  // story, answerable whenever, and answering one rewrites it.
  //
  // One at a time. Five of these stacked in a column is a form, and a form
  // about your own holiday is a thing to close rather than fill in. Answered
  // or skipped, it falls off the list and the next one takes its place, so
  // the ask is always "one more?" instead of "all of these?".
  const asks = asking.length > 0 && (
    <div className="story-asks">
      <div className="story-asks-top">
        <span className="story-asks-count">
          {asking.length === 1 ? 'one thing I could not work out' : `${asking.length} things I could not work out`}
        </span>
      </div>
      <Ask key={asking[0].id} q={asking[0]} onAnswer={answer} onSkip={() => skip(asking[0])} />
    </div>
  )

  // Answered something since this was last written? Offer to fold it in.
  const toFold = story && confirmed(questions).length > 0 && step === 'idle'

  if (step !== 'idle') {
    return (
      <div className="story">
        <div className="story-doing">{howFar(step, done, total)}</div>
        {asks}
        {trouble && <div className="story-trouble">{trouble}</div>}
        {written && <div className="story-sofar">{written}</div>}
      </div>
    )
  }

  if (story) {
    return (
      <div className="story">
        {asks}
        {toFold && (
          <button className="story-go" onClick={carryOn}>
            Write it again with my answers
          </button>
        )}
        {/* Folded away by default. It is several thousand words, and this is
            the photographs screen — somebody who came to look at pictures
            should not have to scroll a chapter of prose to reach them. */}
        <button className="story-open" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>{open ? 'Hide the story' : 'Read the story of this trip'}</span>
          <span className="story-open-mark">{open ? '−' : '+'}</span>
        </button>
        {open && written}
        {/* And a way out at the bottom. Six thousand words in, the toggle
            that opened this is a long way up the page, and the way to close
            something should be where you are when you want to. */}
        {open && (
          <button className="story-open story-open--end" onClick={() => setOpen(false)}>
            <span>Hide the story</span>
            <span className="story-open-mark">−</span>
          </button>
        )}
        {trouble && <div className="story-trouble">{trouble}</div>}
      </div>
    )
  }

  return (
    <div className="story">
      <div className="story-sub">
        {cost.looking > 0
          ? `Working out the story of this trip. ${cost.looking} photographs still to read — the story appears first and gets better as they are.`
          : 'Working out the story of this trip.'}
      </div>
      {trouble && (
        <>
          <div className="story-trouble">{trouble}</div>
          <button className="story-go" onClick={itself}>
            try again
          </button>
        </>
      )}
    </div>
  )
}
