import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { zoneFor } from '../lib/localTime.js'
import { clockIn } from '../lib/localTime.js'
import { BATCH, inParallel, readingList } from '../lib/seeing.js'
import {
  daysAdded,
  asAsked,
  batches,
  confirmed,
  howFar,
  needsLooking,
  whatItCosts,
  worthAsking,
} from '../lib/storyRun.js'
import { running, whatThereIs } from '../lib/storyBuild.js'

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
//
// Only the first of those still happens here. Reading the photographs needs
// their bytes and a lot of small parallel calls, so it stays in the browser;
// everything after it moved to /api/build-story, which runs to completion
// whether or not this tab is still open. Locking the phone halfway through
// used to kill the run silently, and the only way to find out was to come
// back later and see the story unchanged.
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
  const [entries, setEntries] = useState([])
  const [flights, setFlights] = useState([])
  const [runs, setRuns] = useState([])
  const [tracks, setTracks] = useState([])
  const [visits, setVisits] = useState([])
  // What the server says it is doing, if anything. The screen reads this
  // rather than being the only thing that knows about the run.
  const [run, setRun] = useState(null)
  const [refresh, setRefresh] = useState(0)
  // Whether the story fetch has answered — not whether it found one.
  const [looked, setLooked] = useState(false)

  const mine = photos.filter((p) => p.trip_id === trip?.id)

  // Whether there is anything to write from at all — which is not the same
  // question as "are there photographs", and treating it as though it were
  // is why six trips with a journal entry on nearly every day, 212 recorded
  // stays and no pictures had no story and no way to ask for one.
  const have = whatThereIs({ photos: mine, tracks, visits, entries, flights, runs })

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
    supabase.from('story_runs').select('*').eq('trip_id', trip.id).maybeSingle()
      .then(({ data }) => alive && setRun(data ?? null))
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
    if (!trip?.id || !have.enough || step !== 'idle') return
    // Somebody else — another tab, another device, the run that was going
    // when the phone locked — already has this trip. Two runs writing one
    // story means the loser's version wins.
    if (running(run)) return
    // A trip with something recorded and no story gets one without being
    // asked, because that is the thing this app does. A trip that already
    // has one gets only the days its new photographs belong to — never the
    // whole thing, and never a chapter nobody's pictures touched.
    if (story && !freshDays.length) return
    const mark = `${trip.id}:${mine.length}:${story?.updated_at ?? 'none'}`
    if (began.current === mark) return
    began.current = mark
    if (story) make({ only: freshDays })
    else itself()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, mine.length, story, freshDays.length, step, entries, looked, have.enough, run])

  // What the server is doing, while it is doing it.
  //
  // The run no longer belongs to this tab, so the tab has to ask. Every few
  // seconds while something is in flight, and never otherwise — a story
  // somebody is reading does not need polling. When the row says it has
  // finished, the story itself is re-read, which is how a run started on a
  // phone appears on a laptop without anybody refreshing anything.
  const watching = step !== 'idle' || running(run)
  useEffect(() => {
    if (!trip?.id || !watching) return
    let alive = true
    const timer = setInterval(async () => {
      const { data } = await supabase.from('story_runs').select('*').eq('trip_id', trip.id).maybeSingle()
      if (!alive) return
      setRun(data ?? null)
      if (data?.finished_at) setRefresh((n) => n + 1)
    }, 4000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [trip?.id, watching])

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

  // It starts itself, in two passes.
  //
  // The story is worth having the moment there is anything to go on, and the
  // fast half of it — a table of times, coordinates and recorded stays — is
  // one server call. So that runs on its own, and the reading of the
  // photographs runs behind it and writes the trip again with what they
  // showed.
  //
  // For a trip with no photographs the first pass is the whole thing, which
  // is the case this used to have no answer for at all.
  async function itself() {
    setTrouble(null)
    try {
      const auth = await token()
      if (!auth) return
      await build(auth)
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
   * Work out what happened and write it — on the server, to completion.
   *
   * Everything below this line used to happen here: build the trace, call
   * the reconstruction, file the questions, call the writing, save the row.
   * All of it depended on this tab staying awake for two or three minutes,
   * and none of it needed to. Now it is one request that either finishes or
   * says why, and the run survives a locked phone.
   *
   * It also fetches its own evidence, which is the part that matters for a
   * trip this component cannot see: the entries, the flights, the recorded
   * stays. Nothing about the reconstruction depends on what a browser
   * happened to have loaded.
   *
   * @param only  dates to rewrite; empty rewrites the whole trip.
   */
  async function build(auth, only = []) {
    setStep('working it out')
    const out = await post('build-story', { trip_id: trip.id, only }, auth)
    setStep('idle')
    setRefresh((n) => n + 1)
    return out
  }

  /** @param only  dates to rewrite; empty rewrites the whole trip. */
  async function make({ only = [] } = {}) {
    setTrouble(null)
    try {
      const auth = await token()
      if (!auth) throw new Error('Sign in first.')

      // The one stage still in the browser: it needs the photographs' own
      // bytes and a lot of small parallel calls, and three hundred of them
      // do not fit in a single server invocation.
      const cheap = await look(auth, 'low')
      const already = mine.filter((p) => p.seen).map((p) => ({ id: p.id, ...p.seen }))
      const everything = [...already, ...cheap]

      // The frames worth reading properly. The cheap pass chooses them
      // rather than geometry: the awning is as likely to be in the shot
      // walking up to a place as in the four taken at the table.
      const worth = new Set(readingList(everything, { limit: 60 }).map(String))
      if (worth.size) await look(auth, 'high', worth)

      await build(auth, only)
    } catch (e) {
      setTrouble(e.message)
      setStep('idle')
    }
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

  /** Not now. Recorded as unanswered-on-purpose so it stops being asked,
   *  and so the writing admits the gap rather than inventing something. */
  async function skip(q) {
    await answer(q, { verdict: 'unsure' })
  }

  /** Write it again with what they have just told us.
   *
   *  This used to skip the reconstruction and go straight to the writing,
   *  which was a saving made in the wrong place: an answer is evidence about
   *  what happened, not decoration on the prose. "A pasta-making course at
   *  Eatalian Cooks, then dinner" should settle the episode, not be dropped
   *  into a chapter built around a gap. So it runs the whole thing, and the
   *  answer reaches the stage that decides what the evening was. */
  async function carryOn() {
    setTrouble(null)
    try {
      const auth = await token()
      if (!auth) throw new Error('Sign in first.')
      await build(auth)
    } catch (e) {
      setTrouble(e.message)
      setStep('idle')
    }
  }

  // Nothing recorded at all — no photographs, no places, no entries, no
  // flights. Not a trip that failed to be written; a trip that has not
  // happened yet.
  if (!trip?.id || !have.enough) return null

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

  // A run this tab did not start: another device, or this one before the
  // phone locked. Saying so is the whole point of moving the run out of the
  // browser — coming back to the app mid-run should show progress rather
  // than an idle screen that quietly starts a second one.
  const elsewhere = step === 'idle' && running(run)

  if (step !== 'idle' || elsewhere) {
    // The server knows which stage it is on; the browser only knows it is
    // waiting. Reading the photographs is the exception — that is still here,
    // and it is the one with a count worth showing.
    const doing = step === 'looking' ? step : run?.step || (step === 'idle' ? 'working it out' : step)
    return (
      <div className="story">
        <div className="story-doing">{howFar(doing, done, total)}</div>
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
