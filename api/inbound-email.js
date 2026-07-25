// Receives forwarded booking confirmations at an inbound address on
// eend.app (Postmark's Inbound webhook posts here). Runs the same AI
// extraction as the paste-a-booking flow, guesses which draft trip it
// belongs to by matching dates, and stashes it as a pending row for the
// person to review in-app — nothing lands in the itinerary automatically.
//
// Postmark doesn't sign inbound webhook payloads, so this endpoint is
// protected with HTTP Basic Auth instead: set the webhook URL in Postmark
// to `https://<user>:<INBOUND_EMAIL_SECRET>@pond.eend.app/api/inbound-email`
// and set INBOUND_EMAIL_SECRET in Vercel to match. Any request without a
// matching secret is rejected before touching OpenAI or Supabase.
import { extractBookingItems } from './_lib/extractBookingItems.js'

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

function sb(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...opts.headers,
    },
  }).then(async (r) => {
    if (!r.ok) throw new Error(`supabase ${path} ${r.status}: ${await r.text()}`)
    const text = await r.text()
    return text ? JSON.parse(text) : null
  })
}

function authorized(req) {
  const secret = process.env.INBOUND_EMAIL_SECRET
  if (!secret) return false // refuse to run wide open if unset
  const header = req.headers.authorization || ''
  if (header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
      const pass = decoded.split(':').slice(1).join(':')
      if (pass === secret) return true
    } catch {
      // fall through
    }
  }
  return req.query?.key === secret
}

// Strip a forwarded/replied email down to the new content — Postmark's
// StrippedTextReply already does this when available; otherwise fall
// back to the full plain-text body (the model is instructed to skip
// marketing/quoted noise anyway).
function bodyText(payload) {
  return (payload.StrippedTextReply || payload.TextBody || '').trim()
}

// Which draft trip does this most likely belong to? Count how many
// extracted items fall within (± 2 days of) each trip's window and pick
// the best match — nullable if nothing overlaps, which just means the
// person picks the trip by hand during review.
function guessTrip(items, trips) {
  if (!items.length || !trips.length) return null
  let best = null
  let bestScore = 0
  for (const t of trips) {
    if (!t.start_date || !t.end_date) continue
    const lo = new Date(t.start_date)
    lo.setDate(lo.getDate() - 2)
    const hi = new Date(t.end_date)
    hi.setDate(hi.getDate() + 2)
    const score = items.filter((it) => {
      const d = new Date(it.event_date)
      return d >= lo && d <= hi
    }).length
    if (score > bestScore) {
      bestScore = score
      best = t.id
    }
  }
  return best
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  if (!authorized(req)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const payload = req.body || {}
  const text = bodyText(payload)
  const fromAddress = payload.FromFull?.Email || payload.From || null
  const subject = payload.Subject || null

  // Always 200 back to Postmark once authorized — a 4xx/5xx makes it
  // retry the same email repeatedly. Failures are logged, not thrown.
  if (!text) {
    res.status(200).json({ ok: true, skipped: 'no body text' })
    return
  }

  try {
    const items = await extractBookingItems({ text })
    if (!items.length) {
      res.status(200).json({ ok: true, skipped: 'nothing extracted' })
      return
    }

    const trips = await sb('trips?select=id,start_date,end_date,status')
    const matchedTripId = guessTrip(items, trips || [])

    await sb('email_imports', {
      method: 'POST',
      body: JSON.stringify({
        from_address: fromAddress,
        subject,
        raw_text: text.slice(0, 12000),
        items,
        matched_trip_id: matchedTripId,
        status: 'pending',
      }),
    })

    res.status(200).json({ ok: true, found: items.length, matchedTripId })
  } catch (err) {
    console.error(err)
    // Still 200 — Postmark would otherwise hammer retries on a transient
    // OpenAI/Supabase hiccup for an email that can't be re-sent by anyone.
    res.status(200).json({ ok: false, error: err.message })
  }
}
