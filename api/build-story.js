import { rest } from './_lib/rest.js'
import { running, whatThereIs } from '../src/lib/storyBuild.js'

// Asking for a story, which is not the same as writing one.
//
// This endpoint used to do the whole job: build the trace, reconstruct,
// file the questions, write, save. That was already better than doing it in
// a browser tab, and it was still wrong in one way — it took three or four
// minutes, and a request that takes three or four minutes is a request
// somebody is waiting on. Close the app and you still lost the answer, even
// though the work itself had moved.
//
// So the work moved again, to api/story-step.js, which pg_cron pokes once a
// minute until the trip is written. What is left here is the only part that
// genuinely needs the person who asked: deciding whether they may.
//
// That division matters more than it looks. Authorisation happens exactly
// once, here, with their own token and their own row-level security —
// claim_story_run() checks is_trip_editor() and refuses otherwise. The
// worker holds a shared secret and no user identity at all, and it can only
// ever act on a row that has already been through this door.
//
// It answers in milliseconds. The screen watches story_runs from there.

const COLUMNS = {
  photos: 'id,url,kind,seen',
  entries: 'entry_date,note,built_from',
  tracks: 'track_date,visits',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  const auth = req.headers.authorization || ''
  if (!auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'sign in first' })
    return
  }

  const { trip_id: tripId } = req.body || {}
  if (!tripId) {
    res.status(400).json({ error: 'trip_id required' })
    return
  }

  const db = rest(auth.slice(7).trim())

  try {
    const [trip] = await db.select('trips', `id=eq.${tripId}&select=id,title&limit=1`)
    if (!trip) {
      res.status(404).json({ error: 'no such trip' })
      return
    }

    // Enough to go on? Asked before claiming, so a trip with nothing
    // recorded is told so immediately rather than being queued for a worker
    // to discover the same thing a minute later.
    //
    // Only the cheap columns: this is a yes-or-no, not the evidence itself,
    // and the worker fetches that for real when it gets there.
    const [photos, entries, flights, runs, tracks] = await Promise.all([
      db.select('photos', `trip_id=eq.${tripId}&select=${COLUMNS.photos}`),
      db.select('journal_entries', `trip_id=eq.${tripId}&select=${COLUMNS.entries}`),
      db.select('flights', `trip_id=eq.${tripId}&select=id`),
      db.select('runs', `trip_id=eq.${tripId}&select=id`),
      db.select('day_tracks', `trip_id=eq.${tripId}&select=${COLUMNS.tracks}`),
    ])

    const have = whatThereIs({ photos, tracks, visits: [], entries, flights, runs })
    if (!have.enough) {
      res.status(400).json({
        error: 'there is nothing recorded for this trip yet — no photographs, no places, no entries',
      })
      return
    }

    // One at a time. The claim is the authorisation and the lock in one
    // statement: it checks is_trip_editor() with this person's token, and
    // refuses if a run is already going.
    const claimed = (await db.rpc('claim_story_run', { p_trip: tripId })) === true
    if (!claimed) {
      const [run] = await db.select('story_runs', `trip_id=eq.${tripId}&select=*&limit=1`)
      if (running(run)) {
        res.status(409).json({ error: 'this trip is already being written', since: run.started_at })
      } else {
        res.status(403).json({ error: "this trip isn't yours to write" })
      }
      return
    }

    res.status(202).json({
      ok: true,
      trip_id: tripId,
      started: true,
      to_see: have.unread,
      // Said out loud because it is the whole point: they can put the phone
      // down now. Roughly a minute a batch of ten, plus a couple of minutes
      // to write it.
      about: have.unread ? `${have.unread} photographs to read` : 'nothing left to read',
    })
  } catch (e) {
    console.error(`build-story: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
