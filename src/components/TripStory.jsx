import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { traceOf } from '../lib/tripTrace.js'
import { zoneFor } from '../lib/localTime.js'
import { clockIn } from '../lib/localTime.js'
import { BATCH, foldInto, readingList } from '../lib/seeing.js'
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

    const got = []
    for (const group of batches(waiting, BATCH)) {
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
      got.push(...(seen ?? []))
      setDone((n) => n + group.length)
    }
    return got
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
      const asks = (worked.ask ?? []).filter((a) => a?.asks)
      if (asks.length) {
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
      <button className="story-go" onClick={make}>
        Tell the story of this trip
      </button>
      <div className="story-sub">
        {cost.looking > 0
          ? `Reads all ${cost.looking} photographs, works out what happened, asks you about anything it cannot settle, then writes it.`
          : `Every photograph has been read already. This works out what happened and writes it.`}
        {cost.already > 0 && ` ${cost.already} already read — those are not paid for twice.`}
      </div>
      {trouble && <div className="story-trouble">{trouble}</div>}
    </div>
  )
}
