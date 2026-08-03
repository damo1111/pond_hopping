// Receives forwarded booking confirmations from whichever inbound-email
// provider is pointed at it. Runs the same AI extraction as the
// paste-a-booking flow, guesses which draft trip it belongs to by matching
// dates, and stashes it as a pending row for the person to review in-app —
// nothing lands in an itinerary automatically.
//
// Provider-agnostic on purpose. CloudMailin is the current plan because it
// hands you an address on its own domain, so it needs no DNS changes at
// all — eend.app has four live subdomains behind it, and moving its
// nameservers to Cloudflare (the only way to get Email Routing, since
// subdomain zones are Enterprise-only) isn't worth that risk for this.
// normalise() below handles CloudMailin, Postmark and SendGrid shapes.
//
// None of these providers sign their webhooks, so this endpoint is
// protected with a shared secret instead: put it in the target URL as
// `?key=<INBOUND_EMAIL_SECRET>` (or use HTTP Basic auth) and set the same
// value in Vercel. Anything without it is rejected before touching OpenAI
// or Supabase.
import { extractBookingItems } from './_lib/extractBookingItems.js'
import { sendPush } from './_lib/sendPush.js'

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

// Every inbound-email provider invents its own payload shape, and which
// one sits in front of this endpoint is a deployment detail that shouldn't
// reach the rest of the code. Normalise here instead:
//
//   Postmark      FromFull.Email / Subject / TextBody / StrippedTextReply
//   CloudMailin   headers.from / headers.subject / plain
//   SendGrid      from / subject / text
//   Cloudflare    (our Worker already mimics Postmark's shape)
//
// StrippedTextReply is preferred where a provider offers it — it removes
// quoted history from a forward. Otherwise take the full plain-text body;
// the extraction model is told to skip marketing and quoted noise anyway.
function normalise(p) {
  const h = p.headers || {}
  return {
    from: p.FromFull?.Email || p.From || h.from || p.envelope?.from || p.from || null,
    subject: p.Subject || h.subject || p.subject || null,
    text: (p.StrippedTextReply || p.TextBody || p.plain || p.text || p.body || '').trim(),
  }
}

// From headers arrive as "David Moritz <david@moritznet.com>"; we want
// just the address, since that's what identifies the owner.
function bareAddress(s) {
  if (!s) return null
  const m = String(s).match(/<([^>]+)>/)
  return (m ? m[1] : String(s)).trim().toLowerCase() || null
}

// Superseded by api_guess_trip() in the database. Kept only as a record of
// why it moved: matching here meant fetching trips with the anon key, and
// reads are scoped to public-or-member — so an anonymous webhook could
// only ever see *public* trips, i.e. finished history, never the private
// drafts someone is actually planning. Doing it in a SECURITY DEFINER
// function also means a forward can only match trips its sender belongs
// to, rather than anyone's.
function guessTripLegacy(items, trips) {
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

  const { from: fromAddress, subject, text } = normalise(req.body || {})

  // Always 200 back to the provider once authorized — a 4xx/5xx makes them
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

    // Matched in the database against trips the *forwarder* belongs to,
    // private drafts included — see api_guess_trip.
    const owner = bareAddress(fromAddress)
    const dates = [...new Set(items.map((i) => i.event_date).filter(Boolean))]
    const matchedTripId = owner && dates.length
      ? await sb('rpc/api_guess_trip', {
          method: 'POST',
          body: JSON.stringify({ p_email: owner, p_dates: dates }),
        }).catch(() => null)
      : null

    await sb('email_imports', {
      method: 'POST',
      // return=minimal matters here. The default (return=representation)
      // makes PostgREST add RETURNING, and returning a row needs SELECT
      // permission — which email_imports grants only to signed-in users,
      // since it holds whole forwarded confirmation emails. The webhook
      // has no session, so the insert itself succeeded and the RETURNING
      // was what tripped RLS. We don't need the row back anyway.
      prefer: 'return=minimal',
      body: JSON.stringify({
        from_address: fromAddress,
        owner_email: owner,
        subject,
        raw_text: text.slice(0, 12000),
        items,
        matched_trip_id: matchedTripId,
        status: 'pending',
      }),
    })

    // Tell them something arrived. Deliberately after the row is safely
    // stored and wrapped in its own catch: a push that fails must never
    // cost someone the import itself, which is the part that matters.
    let push = null
    if (owner) {
      const one = items[0]
      push = await sendPush({
        email: owner,
        title: items.length === 1 ? 'Booking added to review' : `${items.length} bookings to review`,
        body:
          items.length === 1
            ? `${one.title}${one.city ? ` · ${one.city}` : ''}`
            : items.map((i) => i.title).slice(0, 3).join(', '),
        data: { kind: 'email_import', tab: 'plan' },
      }).catch((e) => ({ error: String(e) }))
    }

    res.status(200).json({ ok: true, found: items.length, matchedTripId, push })
  } catch (err) {
    console.error(err)
    // Still 200 — the provider would otherwise hammer retries on a
    // transient OpenAI/Supabase hiccup for an email nobody can re-send.
    res.status(200).json({ ok: false, error: err.message })
  }
}
