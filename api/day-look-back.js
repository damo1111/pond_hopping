import { sendPush } from './_lib/sendPush.js'
import { dueNow, lookBackAt, worthSending } from '../src/lib/dayLookBack.js'
import { pushLine } from '../src/lib/dayPush.js'
import { zoneAt } from '../src/lib/legs.js'

// The evening look-back, sent.
//
// dayLookBack.js counts the day and dayPush.js chooses what to say about
// it; both have been finished, tested and unreachable for a while, because
// there was nothing to call them. This is that thing.
//
// ── The only interesting decision in here ────────────────────────────────
//
// Nine in the evening is a *local* time. A nightly job would fire at nine
// o'clock somewhere and be four in the afternoon or five in the morning
// everywhere else, so pg_cron pokes this every hour and every candidate is
// asked separately whether it is yet nine where *they* are.
//
// Where they are comes from the last located photograph of that day, not
// from the trip: on a travel day the answer is the far end, and being told
// about your day in Bangkok at nine o'clock Sydney time is being told about
// it over lunch.
//
// ── Why there is no model in it ──────────────────────────────────────────
//
// The line on the lock screen is made by pushLine(), deterministically, from
// counts. It has to be short, it has to be right, and it must not cost a
// model call for every hopper every evening — see the comment on oneLine().
// So this endpoint is arithmetic and two HTTP calls, and needs no maxDuration
// entry of its own beyond the default.
//
// ── Who this is ──────────────────────────────────────────────────────────
//
// Nobody, same as story-step.js: a cron tick has no signed-in person behind
// it. No service key — four SECURITY DEFINER functions gated on the shared
// secret, each doing one thing, none able to reach a trip it was not handed.

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

/** A ceiling on one sweep, so a bad day cannot turn into a long invocation.
 *  Well above any plausible number of people mid-trip at the same hour; it
 *  exists to bound the worst case, not to ration the ordinary one. */
export const PER_SWEEP = 40

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

/**
 * One person's evening, from candidate to sent.
 *
 * Returns why it did nothing when it does nothing, because "the tick ran and
 * sent none" is the normal state for twenty-three hours out of twenty-four
 * and is indistinguishable from "the tick is broken" without this.
 */
async function evening(secret, { trip_id, email, on_date }, now) {
  const day = await rpc('look_back_day', { p_secret: secret, p_trip: trip_id, p_date: on_date })
  if (!day) return { on_date, skipped: 'no day' }

  const facts = lookBackAt(on_date, day.photos ?? [], {
    flights: day.flights ?? [],
    runs: day.runs ?? [],
    stays: day.stays ?? [],
    been: day.been ?? [],
  })

  // A day at the hotel with a book is a perfectly good day and does not need
  // a summary. This is the difference between a daily notification and a
  // daily annoyance that gets switched off.
  if (!worthSending(facts)) return { on_date, skipped: 'nothing to say' }

  // facts.zone is null when not one photograph of the day carried a fix.
  // The trip's last known position is a better answer than giving up: it is
  // the same city nine times out of ten, and being an hour out on when the
  // evening arrives is a far smaller harm than never sending it.
  const where = Array.isArray(day.where_last) ? day.where_last : null
  const zone = facts.zone ?? (where ? zoneAt(where) : null)

  const when = dueNow(on_date, zone, now)
  if (!when.due) return { on_date, skipped: when.why, at: when.at }

  const recent = await rpc('look_back_recent', {
    p_secret: secret,
    p_trip: trip_id,
    p_email: email,
    p_before: on_date,
  })
  const line = pushLine(facts, { recent: Array.isArray(recent) ? recent : [] })
  if (!line) return { on_date, skipped: 'no line' }

  // Recorded *before* it is sent, and the insert is the lock. Two ticks
  // racing — an hour's tick overrunning into the next — both reach here
  // with the same evening, and exactly one gets a true. Doing it the other
  // way round risks two notifications for one evening, and a duplicate on a
  // lock screen is worse than a missed one.
  const mine = await rpc('look_back_sent', {
    p_secret: secret,
    p_trip: trip_id,
    p_email: email,
    p_date: on_date,
    p_shape: line.shape,
    p_line: line.text,
    p_facts: facts,
  })
  if (!mine) return { on_date, skipped: 'already sent' }

  const out = await sendPush({
    email,
    title: day.trip?.title ?? 'Today',
    body: line.text,
    data: { kind: 'look_back', trip_id, on_date },
  })
  return { on_date, sent: out?.sent ?? 0, shape: line.shape }
}

export default async function handler(req, res) {
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

  // Somewhere to stand while testing, without waiting for nine o'clock in
  // whichever zone the fixture is in. Only reachable with the secret.
  const now = Number.isFinite(Number(req.query?.at)) ? Number(req.query.at) : Date.now()

  try {
    const waiting = await rpc('look_back_candidates', { p_secret: secret })
    const candidates = Array.isArray(waiting) ? waiting.slice(0, PER_SWEEP) : []

    const done = []
    for (const c of candidates) {
      try {
        done.push({ ...(await evening(secret, c, now)), email: c.email })
      } catch (err) {
        // One person's evening failing must not cost everybody else theirs.
        console.error(`day-look-back: ${c.trip_id} ${c.on_date} — ${err.message}`)
        done.push({ on_date: c.on_date, email: c.email, failed: err.message })
      }
    }

    res.status(200).json({
      ok: true,
      looked: Array.isArray(waiting) ? waiting.length : 0,
      sent: done.filter((d) => d.sent).length,
      done,
    })
  } catch (err) {
    console.error(`day-look-back: ${err.message}`)
    res.status(500).json({ error: err.message })
  }
}
