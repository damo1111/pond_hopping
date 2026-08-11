import { rest } from './_lib/rest.js'
import { reconstruct } from './reconstruct-trip.js'
import { writeUp } from './write-trip.js'
import { traceOf } from '../src/lib/tripTrace.js'
import { zoneFor } from '../src/lib/localTime.js'
import { foldInto } from '../src/lib/seeing.js'
import {
  confirmed,
  couldNotSay,
  spliceChapters,
  stillOpen,
  storyRow,
  theirWords,
  widerThanADay,
} from '../src/lib/storyRun.js'
import { howItWent, newQuestions, running, whatThereIs } from '../src/lib/storyBuild.js'

// Writing a trip up without a browser tab holding it open.
//
// Everything this does was already being done — in a React component, in a
// tab, on a phone. Which meant the run belonged to the tab: lock the screen
// and the JavaScript is suspended, the story never finishes, and there is no
// way to find that out except by coming back later and seeing it unchanged.
// It bit twice in one evening, which is what moved it to the top of the list.
//
// The second reason is less obvious and turned out to matter more. The
// component starts itself from `photos.length`, and returns null without any:
// so six trips imported from a Google Timeline — 4,217 recorded positions,
// 212 stays, a journal entry on nearly every day, and not one photograph —
// had no story and no button anywhere in the app that could give them one.
// They were not failing. They were unreachable.
//
// WHAT THIS DOES AND DOES NOT DO
//
// Reconstruct, ask, write, save. Not the seeing: reading three hundred
// photographs does not fit in one invocation and wants a queue of small
// steps, which is the next piece. So this works from the photographs that
// have already been read, says how many have not, and is complete for a trip
// with none at all — which is exactly the case that had no path through the
// app before.
//
// It acts as the person who asked, with their token and their row-level
// security. There is no service key in this file on purpose.

/** Vercel's ceiling. The two model calls are the whole of the time. */
export const config = { maxDuration: 300 }

const COLUMNS = {
  photos: 'id,url,taken_at,taken_on,lat,lon,kind,seen,seen_detail,created_at',
  entries: 'entry_date,note,built_from',
  flights: 'flight_number,dep_airport,arr_airport,dep_time,arr_time',
  runs: 'run_date,distance_km,pace,elevation_m,sport',
  tracks: 'track_date,visits',
  visits: 'arrived_at,departed_at,lat,lng,source',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured' })
    return
  }
  const auth = req.headers.authorization || ''
  if (!auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'sign in first' })
    return
  }

  const { trip_id: tripId, only = [] } = req.body || {}
  if (!tripId) {
    res.status(400).json({ error: 'trip_id required' })
    return
  }

  const db = rest(auth.slice(7).trim())
  let claimed = false

  try {
    const [trip] = await db.select('trips', `id=eq.${tripId}&select=*&limit=1`)
    if (!trip) {
      res.status(404).json({ error: 'no such trip' })
      return
    }

    // One at a time. A double tap used to be two full runs racing to write
    // the same story, and the loser's version won.
    claimed = (await db.rpc('claim_story_run', { p_trip: tripId })) === true
    if (!claimed) {
      // The claim says no for two different reasons and they deserve two
      // different answers: somebody else is mid-run, or this trip is not
      // theirs to write.
      const [run] = await db.select('story_runs', `trip_id=eq.${tripId}&select=*&limit=1`)
      if (running(run)) {
        res.status(409).json({ error: 'this trip is already being written', since: run.started_at })
      } else {
        res.status(403).json({ error: "this trip isn't yours to write" })
      }
      return
    }

    const [photos, entries, flights, runs, tracks, visits, questions, stories, profiles] =
      await Promise.all([
        db.select('photos', `trip_id=eq.${tripId}&select=${COLUMNS.photos}`),
        db.select('journal_entries', `trip_id=eq.${tripId}&select=${COLUMNS.entries}`),
        db.select('flights', `trip_id=eq.${tripId}&select=${COLUMNS.flights}`),
        db.select('runs', `trip_id=eq.${tripId}&select=${COLUMNS.runs}`),
        db.select('day_tracks', `trip_id=eq.${tripId}&select=${COLUMNS.tracks}`),
        db.select('location_visits', `select=${COLUMNS.visits}`),
        db.select('story_questions', `trip_id=eq.${tripId}&select=*`),
        db.select('trip_stories', `trip_id=eq.${tripId}&select=*&limit=1`),
        db.select('profiles', 'select=learn_my_voice&limit=1'),
      ])

    const have = whatThereIs({ photos, tracks, visits, entries, flights, runs })
    if (!have.enough) {
      await done(db, tripId, false, 'nothing recorded to write from')
      res.status(400).json({
        error: 'there is nothing recorded for this trip yet — no photographs, no places, no entries',
      })
      return
    }

    const story = stories[0] ?? null
    const learnVoice = !!profiles[0]?.learn_my_voice
    const zone = zoneFor({
      flights,
      lon: photos.find((p) => p.lon != null)?.lon ?? null,
      when: photos.find((p) => p.taken_at)?.taken_at ?? null,
    })

    // Only what has already been looked at. A photograph is paid for once
    // and read in the browser; this stage never buys one.
    const seen = photos.filter((p) => p.seen).map((p) => ({ id: p.id, ...p.seen }))
    const trace = foldInto(traceOf(photos, trip, { flights, runs, zone, tracks, visits }), seen)

    await step(db, tripId, 'working it out')
    const worked = await reconstruct({
      trace,
      theirs: theirWords(entries),
      answered: confirmed(questions),
      could_not_say: couldNotSay(questions),
      already_asked: stillOpen(questions),
    })

    // Anything only they can settle is written down and asked — and then it
    // writes anyway. Stopping here to wait was how four runs over one trip
    // produced no story at all.
    const asks = newQuestions(questions, worked.ask ?? [])
    if (asks.length) {
      await db.insert(
        'story_questions',
        asks.map((a) => ({ ...a, trip_id: tripId }))
      )
    }

    // A day-scoped rewrite stays day-scoped only while the trip's own threads
    // hold. If what came back changed what the trip was about — a fourth
    // crossing of a square that three chapters call the third — the chapters
    // leaning on it are stale, and the honest answer is to write the trip
    // again rather than leave a sentence that has quietly become untrue.
    const scope = widerThanADay(story?.reconstruction, worked) ? [] : only

    await step(db, tripId, 'writing')
    const written = await writeUp({
      reconstruction: {
        ...worked,
        answered: confirmed(questions),
        could_not_say: couldNotSay(questions),
      },
      theirs: theirWords(entries),
      voice: learnVoice ? entries.filter((e) => !e.built_from).map((e) => e.note).filter(Boolean) : [],
      only: scope,
    })

    const row = storyRow(trip, written, worked, { voice: learnVoice ? 'theirs' : 'narrator' })
    // A day's rewrite is spliced in rather than replacing the trip. The
    // other chapters were already read, and the writing is not deterministic
    // enough to redo them for nothing.
    if (scope.length) {
      row.chapters = spliceChapters(story?.chapters ?? [], written.days ?? [])
      row.opening = written.opening ?? story?.opening ?? null
      row.closing = written.closing ?? story?.closing ?? null
    }

    const saved = await db.upsert('trip_stories', row, 'trip_id')
    // PostgREST answers 204 to a write row-level security refused, so an
    // empty answer here is a refusal wearing the clothes of a success.
    if (!saved.length) throw new Error('the story could not be saved — this trip is not yours to write')

    const note = howItWent({
      chapters: row.chapters?.length ?? 0,
      asked: asks.length,
      unread: have.unread,
    })
    await done(db, tripId, true, note)

    res.status(200).json({
      ok: true,
      trip_id: tripId,
      chapters: row.chapters?.length ?? 0,
      asked: asks.length,
      unread: have.unread,
      note,
    })
  } catch (e) {
    console.error(`build-story: ${e.message}`)
    // The claim is released whatever happened. A run that dies holding it
    // would lock the trip until the fifteen minutes ran out, and the person
    // watching has no idea why the button does nothing.
    if (claimed) await done(db, tripId, false, e.message).catch(() => {})
    res.status(502).json({ error: e.message })
  }
}

/** Where the run has got to, for a screen that reads state rather than
 *  driving it. */
async function step(db, tripId, name) {
  await db.update('story_runs', `trip_id=eq.${tripId}`, { step: name }).catch(() => {})
}

async function done(db, tripId, ok, note) {
  await db.update('story_runs', `trip_id=eq.${tripId}`, {
    finished_at: new Date().toISOString(),
    ok,
    note: note ? String(note).slice(0, 500) : null,
    step: null,
  })
}
