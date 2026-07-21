// The killer onboarding move: with the user's permission (Gmail read
// scope, granted via Google sign-in), scan their inbox for everything
// that belongs to a trip — flights, hotels, restaurant bookings, tours —
// and hand back structured events for them to approve before anything is
// added. Nothing is written here; this only PROPOSES.
//
// Key subtlety: a booking confirmation arrives when you BOOK (often months
// before travel), so we can't filter by email date. We cast a wide net
// over travel senders/keywords across the last ~14 months, then let the
// model decide which emails describe something happening inside the trip
// window and pull the real dates out of the body.
import OpenAI from 'openai'

const MODEL = 'gpt-5.5'
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

// Wide net: travel-ish senders OR booking-ish subjects. The model does the
// real filtering; this just keeps the candidate set sane.
const QUERY = [
  'newer_than:14m',
  '(',
  'from:airbnb OR from:booking.com OR from:expedia OR from:hotels.com OR from:marriott OR from:hilton OR from:ihg OR from:accor',
  'OR from:opentable OR from:resy OR from:sevenrooms OR from:thefork',
  'OR from:srilankan OR from:britishairways OR from:qantas OR from:ba.com OR from:easyjet OR from:ryanair',
  'OR from:trainline OR from:nationalrail',
  'OR subject:(confirmation OR itinerary OR reservation OR "e-ticket" OR "booking reference" OR "booking confirmed" OR receipt OR "you\'re all set" OR reserved)',
  ')',
].join(' ')

async function gapi(path, token) {
  const r = await fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`gmail ${path} ${r.status}: ${await r.text()}`)
  return r.json()
}

function b64urlDecode(data) {
  if (!data) return ''
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return ''
  }
}

// Walk the MIME tree; prefer text/plain, fall back to a crude HTML strip.
function extractText(payload) {
  if (!payload) return ''
  const stack = [payload]
  let plain = ''
  let html = ''
  while (stack.length) {
    const p = stack.pop()
    if (p.parts) stack.push(...p.parts)
    const mime = p.mimeType || ''
    const data = p.body?.data
    if (!data) continue
    if (mime === 'text/plain') plain += b64urlDecode(data)
    else if (mime === 'text/html') html += b64urlDecode(data)
  }
  let text = plain || html.replace(/<[^>]+>/g, ' ')
  // Marketing emails are padded with soft-hyphen/zero-width tracking runs
  // and endless whitespace — collapse it so the useful text isn't drowned.
  return text
    .replace(/[­​͏‌‍]/g, '')
    .replace(/https?:\/\/\S+/g, '') // links are noise for extraction
    .replace(/[ \t ]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 2600)
}

const EXTRACT_TOOL = {
  type: 'function',
  function: {
    name: 'record_trip_items',
    description: 'Record travel items found in the emails that fall within the trip window.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['flight', 'hotel', 'transport', 'activity', 'place'] },
              title: { type: 'string', description: 'e.g. "Airbnb — The Snug, Holt" or "BA16 SYD → LHR" or "Dinner at Dishoom"' },
              event_date: { type: 'string', description: 'YYYY-MM-DD — start/check-in/departure date' },
              end_date: { type: 'string', description: 'YYYY-MM-DD checkout/return date, if multi-day; else omit' },
              start_time: { type: 'string', description: 'HH:MM 24h local, if known; else omit' },
              city: { type: 'string' },
              note: { type: 'string', description: 'confirmation number, host, party size — short' },
              confidence: { type: 'number', description: '0..1 how sure this is real and in-window' },
              source_subject: { type: 'string', description: 'subject line it came from' },
            },
            required: ['kind', 'title', 'event_date', 'confidence', 'source_subject'],
          },
        },
      },
      required: ['items'],
    },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  const { accessToken, start, end } = req.body || {}
  if (!accessToken) {
    res.status(400).json({ error: 'accessToken required' })
    return
  }
  if (!start || !end) {
    res.status(400).json({ error: 'trip start and end required' })
    return
  }

  try {
    const list = await gapi(`/messages?maxResults=30&q=${encodeURIComponent(QUERY)}`, accessToken)
    const ids = (list.messages || []).map((m) => m.id).slice(0, 25)
    if (!ids.length) {
      res.status(200).json({ items: [], scanned: 0 })
      return
    }

    const emails = []
    for (const id of ids) {
      try {
        const msg = await gapi(`/messages/${id}?format=full`, accessToken)
        const headers = Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]))
        const body = extractText(msg.payload)
        if (body) emails.push({ subject: headers.subject || '(no subject)', from: headers.from || '', body })
      } catch {
        /* skip a message we can't read */
      }
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const sys =
      `You extract real travel bookings from a user's emails for a specific trip.\n` +
      `Trip window: ${start} to ${end} (inclusive). Booking-confirmation emails often arrive MONTHS before travel — ` +
      `ignore when the email was sent; use the travel dates written in the body.\n` +
      `Only record an item whose date falls between ${start} and ${end} (a day either side is fine for red-eyes).\n` +
      `Skip marketing, price alerts, cancelled bookings, and anything outside the window. Be conservative with confidence.\n` +
      `Normalise titles like the app does: flights "BA16 SYD → LHR", stays "Airbnb — <name>, <town>", dinners "Dinner at <place>".`
    const userMsg = emails
      .map((e, i) => `--- EMAIL ${i + 1} ---\nSubject: ${e.subject}\nFrom: ${e.from}\n${e.body}`)
      .join('\n\n')

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userMsg },
      ],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'function', function: { name: 'record_trip_items' } },
    })

    const call = response.choices[0]?.message?.tool_calls?.[0]
    let items = []
    if (call) {
      try {
        items = JSON.parse(call.function.arguments).items || []
      } catch {
        items = []
      }
    }
    // Final guard: keep only in-window, drop very low confidence, de-dupe by
    // date+kind+title so a two-message thread doesn't double up.
    const pad = (d, days) => {
      const x = new Date(d + 'T00:00:00')
      x.setDate(x.getDate() + days)
      return x.toISOString().slice(0, 10)
    }
    const lo = pad(start, -1)
    const hi = pad(end, 1)
    const seen = new Set()
    items = items.filter((it) => {
      if (!it.event_date || it.event_date < lo || it.event_date > hi) return false
      if ((it.confidence ?? 0) < 0.45) return false
      const key = `${it.event_date}|${it.kind}|${(it.title || '').toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    res.status(200).json({ items, scanned: emails.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
