// The zero-setup path to the same magic as the Gmail scan, minus Google.
// The user pastes (or forwards → copies) a booking email; we run the exact
// same extraction and hand back structured events to review. No OAuth, no
// console, no inbox access — just text in, trip items out.
import OpenAI from 'openai'

const MODEL = 'gpt-5.5'

const EXTRACT_TOOL = {
  type: 'function',
  function: {
    name: 'record_trip_items',
    description: 'Record travel items found in the pasted text that fall within the trip window.',
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
              event_date: { type: 'string', description: 'YYYY-MM-DD start/check-in/departure date' },
              end_date: { type: 'string', description: 'YYYY-MM-DD checkout/return date, if multi-day; else omit' },
              start_time: { type: 'string', description: 'HH:MM 24h local, if known; else omit' },
              city: { type: 'string' },
              note: { type: 'string', description: 'confirmation number, host, party size — short' },
              confidence: { type: 'number', description: '0..1 how sure this is real and in-window' },
              source_subject: { type: 'string', description: 'a short label for what this came from' },
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
  const { text, start, end } = req.body || {}
  if (!text || !text.trim()) {
    res.status(400).json({ error: 'text required' })
    return
  }
  if (!start || !end) {
    res.status(400).json({ error: 'trip start and end required' })
    return
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const sys =
      `You extract real travel bookings from pasted email/confirmation text for a specific trip.\n` +
      `Trip window: ${start} to ${end} (inclusive). A confirmation is often sent months before travel — ` +
      `ignore when it was sent; use the travel dates written in the text.\n` +
      `Only record items whose date falls between ${start} and ${end} (a day either side is fine for red-eyes).\n` +
      `The paste may contain one booking or several. Skip marketing, cancelled bookings and anything out of window.\n` +
      `Normalise titles like the app does: flights "BA16 SYD → LHR", stays "Airbnb — <name>, <town>", dinners "Dinner at <place>".`

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: String(text).slice(0, 12000) },
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
      if ((it.confidence ?? 0) < 0.4) return false
      const key = `${it.event_date}|${it.kind}|${(it.title || '').toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    res.status(200).json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
