import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { traceOf } from '../lib/tripTrace.js'
import { zoneFor } from '../lib/localTime.js'
import { clockIn } from '../lib/localTime.js'
import { BATCH, foldInto, inParallel, readingList } from '../lib/seeing.js'
import {
  asAsked,
  batches,
  confirmed,
  howFar,
  needsLooking,
  stillAsking,
  storyRow,
  theirWords,
  whatItCosts,
} from '../lib/storyRun.js'

// The story of a trip, made in three stages, with a question in the middle.
//
// See docs/the-story.md. The short version: look at every photograph once,
// work out what happened from the whole trace rather than a summary of it,
// stop and ask the things only the person who was there can settle, then
// write it — and never over what they wrote themselves.
export default function TripStory({ trip, photos = [] }) {
  const [step, setStep] = useState('idle')
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [trouble, setTrouble] = useState(null)
  const [story, setStory] = useState(null)
  const [questions, setQuestions] = useState([])
  const [reconstruction, setReconstruction] = useState(null)
  const [entries, setEntries] = useState([])
  const [flights, setFlights] = useState([])
  const [runs, setRuns] = useState([])
  const [learnVoice, setLearnVoice] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const mine = photos.filter((p) => p.trip_id === trip?.id)

  useEffect(() => {
    if (!trip?.id) return
    let alive = true
    supabase.from('trip_stories').select('*').eq('trip_id', trip.id).maybeSingle()
      .then(({ data }) => alive && setStory(data ?? null))
    supabase.from('story_questions').select('*').eq('trip_id', trip.id)
      .then(({ data }) => alive && setQuestions(data ?? []))
    supabase.from('journal_entries').select('entry_date,note,built_from').eq('trip_id', trip.id)
      .then(({ data }) => alive && setEntries(data ?? []))
    supabase.from('flights').select('flight_number,dep_airport,arr_airport,dep_time,arr_time').eq('trip_id', trip.id)
      .then(({ data }) => alive && setFlights(data ?? []))
    supabase.from('runs').select('run_date,distance_km,pace,elevation_m,sport').eq('trip_id', trip.id)
      .then(({ data }) => alive && setRuns(data ?? []))
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
  const began = useRef('')
  useEffect(() => {
    if (!trip?.id || !mine.length || story || step !== 'idle') return
    if (!entries) return
    const mark = `${trip.id}:${mine.length}`
    if (began.current === mark) return
    began.current = mark
    itself()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, mine.length, story, step, entries])

  async function itself() {
    setTrouble(null)
    try {
      const auth = await token()
      if (!auth) return
      const worked = await quickly(auth)
      if (stillAsking(questions).length) {
        setStep('asking')
        return
      }
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
    const trace = foldInto(traceOf(mine, trip, { flights, runs, zone }), seen)
    const worked = await post('reconstruct-trip', { trace }, auth)
    setReconstruction(worked)
    await ask(worked)
    return worked
  }

  /** Whatever the reconstruction could not settle becomes a question. */
  async function ask(worked) {
    const asks = (worked.ask ?? []).filter((a) => a?.asks)
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

  async function make() {
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
      const trace = foldInto(traceOf(mine, trip, { flights, runs, zone }), everything)
      const worked = await post('reconstruct-trip', { trace }, auth)
      setReconstruction(worked)

      // Anything only they can settle is written down and asked before a
      // word gets written. The answer is evidence; a guess would not be.
      if (await ask(worked)) {
        setStep('asking')
        return
      }

      await write(auth, worked)
    } catch (e) {
      setTrouble(e.message)
      setStep('idle')
    }
  }

  async function write(auth, worked) {
    setStep('writing')
    const written = await post(
      'write-trip',
      {
        reconstruction: { ...worked, answered: confirmed(questions) },
        theirs: theirWords(entries),
        voice: learnVoice ? entries.filter((e) => !e.built_from).map((e) => e.note).filter(Boolean) : [],
      },
      auth
    )
    const row = storyRow(trip, written, worked, { voice: learnVoice ? 'theirs' : 'narrator' })
    const { error } = await supabase.from('trip_stories').upsert(row, { onConflict: 'trip_id' })
    if (error) throw new Error(error.message)
    setStep('idle')
    setRefresh((n) => n + 1)
  }

  async function answer(q, said) {
    await supabase
      .from('story_questions')
      .update({ answer: said, answered_at: new Date().toISOString() })
      .eq('id', q.id)
    setQuestions((all) => all.map((x) => (x.id === q.id ? { ...x, answer: said, answered_at: 'now' } : x)))
  }

  async function carryOn() {
    setTrouble(null)
    try {
      const auth = await token()
      await write(auth, reconstruction)
    } catch (e) {
      setTrouble(e.message)
      setStep('asking')
    }
  }

  if (!trip?.id || !mine.length) return null

  const asking = stillAsking(questions)
  const cost = whatItCosts(mine, 'low')

  if (step !== 'idle') {
    return (
      <div className="story">
        <div className="story-doing">{howFar(step, done, total)}</div>
        {step === 'asking' && (
          <div className="story-asks">
            <p className="story-sub">
              These are things the photographs suggest but cannot prove. Your answer becomes part of
              the story; a no is remembered and you will not be asked again.
            </p>
            {asking.map((q) => (
              <div key={q.id} className="story-ask">
                <div className="story-q">{q.asks}</div>
                {q.because && <div className="story-because">{q.because}</div>}
                <div className="story-buttons">
                  <button onClick={() => answer(q, 'yes')}>yes</button>
                  <button onClick={() => answer(q, 'no')}>no</button>
                  <button onClick={() => answer(q, 'unsure')}>can't remember</button>
                </div>
              </div>
            ))}
            {!asking.length && (
              <button className="story-go" onClick={carryOn}>
                Write it
              </button>
            )}
          </div>
        )}
        {trouble && <div className="story-trouble">{trouble}</div>}
      </div>
    )
  }

  if (story) {
    return (
      <div className="story">
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
        <button className="story-again" onClick={make}>
          write it again
        </button>
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
