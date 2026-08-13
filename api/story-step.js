import { preflight } from './_lib/cors.js'
import { look } from './see-photos.js'
import { reconstruct } from './reconstruct-trip.js'
import { writeUp } from './write-trip.js'
import { sendPush } from './_lib/sendPush.js'
import { traceOf } from '../src/lib/tripTrace.js'
import { zoneFor } from '../src/lib/localTime.js'
import { BATCH, foldInto } from '../src/lib/seeing.js'
import { asAsked } from '../src/lib/storyRun.js'
import { clockIn } from '../src/lib/localTime.js'
import {
  confirmed,
  couldNotSay,
  spliceChapters,
  stillOpen,
  storyRow,
  theirWords,
} from '../src/lib/storyRun.js'
import { howItWent, newQuestions } from '../src/lib/storyBuild.js'

// One step of a story, done by nobody in particular.
//
// api/build-story.js reconstructs and writes on the server, and that was
// most of the way there. What it could not take was the seeing: three
// hundred photographs, ten to a call, does not fit in one 300-second
// invocation however it is arranged. So the reading stayed in the browser
// tab, and a big first upload still wanted the app left open.
//
// A queue needs something outside the request to turn the handle, and that
// is pg_cron: once a minute it looks for unfinished runs and pokes this
// endpoint through pg_net, exactly as the signup notification already does.
// Each poke is one batch, well inside the limit, and the record of where
// things got to is story_runs rather than a variable in a component.
//
// ── Who this is ──────────────────────────────────────────────────────────
//
// Nobody. There is no signed-in person behind a cron tick, which is normally
// where a service key appears and row-level security stops applying to the
// whole endpoint. Instead this holds the shared secret Vercel already has as
// PUSH_SECRET, and reaches the database only through six functions that take
// that secret and a single trip id.
//
// The authorisation happened earlier and by somebody real: claim_story_run()
// checks is_trip_editor() against the person's own token, and no row reaches
// this worker without having been through it. This carries out a decision;
// it does not make one.

// The limit this needs is declared in vercel.json, not here, and it is the
// one thing about this file that is easy to get wrong.
//
// A tick that only looks at ten photographs is quick. A tick that finds
// nothing left to look at does the reconstruction and the writing in the
// same invocation — the two calls that needed the full five minutes when
// they lived in build-story.js. reconstruct-trip.js and write-trip.js have
// their own 300 in vercel.json and it does not help: this imports their
// functions and runs them inside its own invocation, under its own limit.
//
// Without an entry of its own this ran on the default. The seeing would
// have looked fine and the writing would have timed out every time, and
// because a failed tick leaves the run unfinished on purpose, cron would
// have retried the most expensive call in the app every two minutes until
// the run was abandoned.

/** One batch a tick. Comfortably inside the limit, and small enough that a
 *  failure costs ten photographs rather than three hundred. */
export const PER_TICK = BATCH

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

async function rpc(name, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const said = await r.text()
  if (!r.ok) throw new Error(`${name} — ${r.status} ${said.slice(0, 200)}`)
  try {
    return JSON.parse(said)
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (preflight(req, res)) return
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  const secret = process.env.PUSH_SECRET
  // A wrong key gets the same answer as a right one with nothing to do, so
  // this endpoint cannot be used to find out whether it is configured.
  if (!secret || (req.query?.key || '') !== secret) {
    res.status(200).json({ ok: true })
    return
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured' })
    return
  }

  const tripId = req.body?.trip_id
  if (!tripId) {
    res.status(400).json({ error: 'trip_id required' })
    return
  }

  try {
    // Still something to look at? Then that is this tick's work, and the
    // writing waits until every photograph has been read — a story written
    // half-blind would only have to be written again.
    const waiting = await rpc('story_photos_to_see', {
      p_secret: secret,
      p_trip: tripId,
      p_limit: PER_TICK,
      p_detail: 'low',
    })

    if (Array.isArray(waiting) && waiting.length) {
      const done = await seeThese(secret, tripId, waiting)
      res.status(200).json({ ok: true, stage: 'seeing', looked: done })
      return
    }

    const out = await writeItUp(secret, tripId)
    res.status(200).json({ ok: true, stage: 'done', ...out })
  } catch (e) {
    console.error(`story-step: ${e.message}`)
    // Recorded on the run rather than only in a log, because the person
    // waiting for this cannot read a log. The run is left unfinished on
    // purpose: the next tick tries again, and after fifteen minutes of no
    // progress claim_story_run() lets it be taken over.
    await rpc('story_run_at', {
      p_secret: secret,
      p_trip: tripId,
      p_stage: null,
      p_note: e.message.slice(0, 400),
    }).catch(() => {})
    res.status(502).json({ error: e.message })
  }
}

/** One batch of photographs, written down as they come back. */
async function seeThese(secret, tripId, waiting) {
  const asked = waiting.map((p) =>
    asAsked(
      { id: p.id, url: p.url, thumb_url: p.thumb_url, taken_at: p.taken_at, lat: p.lat, lon: p.lon },
      'low',
      null,
      clockIn
    )
  )
  const { seen } = await look(asked, 'low')

  // Saved one at a time as they arrive. A tick that dies halfway has still
  // paid for what it looked at, and nothing should make somebody buy the
  // same photograph twice.
  let kept = 0
  for (const s of seen ?? []) {
    const { id, ...rest } = s ?? {}
    if (!id) continue
    await rpc('story_photo_seen', {
      p_secret: secret,
      p_photo: id,
      p_seen: rest,
      p_detail: 'low',
    }).catch(() => {})
    kept++
  }

  // How much is left, so a screen can say so honestly rather than spinning.
  //
  // This asked for at most sixty, and then reported the length of what came
  // back as the number remaining. So a trip with a hundred and eighty-nine
  // photographs still to read said "sixty left" — and the screen, which
  // shows seen out of seen-plus-left, read "10 of 70", then "20 of 80", then
  // "30 of 90". A total that grows by exactly as much as the progress does
  // is a bar that never moves, and it looks precisely like starting over.
  //
  // Counted properly now. The ceiling is a guard against a runaway query,
  // not a limit anybody's holiday will reach.
  const left = await rpc('story_photos_to_see', {
    p_secret: secret,
    p_trip: tripId,
    p_limit: 5000,
    p_detail: 'low',
  }).catch(() => [])

  await rpc('story_run_at', {
    p_secret: secret,
    p_trip: tripId,
    p_stage: 'seeing',
    p_seen: kept,
    p_to_see: Array.isArray(left) ? left.length : 0,
  })
  return kept
}

/** Everything read. Work out what happened, ask what cannot be settled,
 *  write it, and tell them it is done. */
async function writeItUp(secret, tripId) {
  await rpc('story_run_at', { p_secret: secret, p_trip: tripId, p_stage: 'writing' })

  const e = await rpc('story_evidence', { p_secret: secret, p_trip: tripId })
  if (!e?.trip) throw new Error('no such trip')

  const photos = e.photos ?? []
  const flights = e.flights ?? []
  const questions = e.questions ?? []
  const entries = e.entries ?? []

  const zone = zoneFor({
    flights,
    lon: photos.find((p) => p.lon != null)?.lon ?? null,
    when: photos.find((p) => p.taken_at)?.taken_at ?? null,
  })
  const seen = photos.filter((p) => p.seen).map((p) => ({ id: p.id, ...p.seen }))
  const trace = foldInto(
    traceOf(photos, e.trip, { flights, runs: e.runs ?? [], zone, tracks: e.tracks ?? [], visits: e.visits ?? [] }),
    seen
  )

  const worked = await reconstruct({
    trace,
    theirs: theirWords(entries),
    answered: confirmed(questions),
    could_not_say: couldNotSay(questions),
    already_asked: stillOpen(questions),
  })

  const asks = newQuestions(questions, worked.ask ?? [])

  const written = await writeUp({
    reconstruction: {
      ...worked,
      answered: confirmed(questions),
      could_not_say: couldNotSay(questions),
    },
    theirs: theirWords(entries),
    voice: e.voice ? entries.filter((x) => !x.built_from).map((x) => x.note).filter(Boolean) : [],
    only: [],
  })

  const row = storyRow(e.trip, written, worked, { voice: e.voice ? 'theirs' : 'narrator' })
  // A day that came back empty keeps what it had rather than losing it.
  row.chapters = spliceChapters(e.story?.chapters ?? [], written.days ?? [])

  await rpc('story_save', { p_secret: secret, p_trip: tripId, p_row: row, p_asks: asks })

  const note = howItWent({ chapters: row.chapters?.length ?? 0, asked: asks.length, unread: 0 })
  await rpc('story_run_at', { p_secret: secret, p_trip: tripId, p_stage: 'done', p_note: note })

  // The thing the whole exercise was for: they can put the phone down and be
  // told when it is ready, instead of coming back to find out.
  await tell(e.owner_email, e.trip, asks.length, note)

  return { chapters: row.chapters?.length ?? 0, asked: asks.length, note }
}

/** A push, and never at the cost of the story. A failed notification must
 *  not turn a finished run into a failed one. */
async function tell(email, trip, asked, note) {
  if (!email) return
  try {
    await sendPush({
      email,
      title: `${trip.title ?? 'Your trip'} is written`,
      body: asked
        ? `${note}. ${asked === 1 ? 'One thing' : `${asked} things`} only you can answer.`
        : note,
      data: { kind: 'story_ready', trip_id: trip.id },
    })
  } catch (err) {
    console.error(`story-step: could not tell anybody — ${err.message}`)
  }
}
