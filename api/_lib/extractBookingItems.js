// Shared AI extraction used by both the paste-a-booking flow
// (parse-booking.js, which already knows which trip and its date window)
// and the inbound-email flow (inbound-email.js, which doesn't know the
// trip yet — that gets guessed afterwards by matching dates to existing
// draft trips). Keeping one copy means both paths normalise titles and
// filter junk the same way.
import OpenAI from 'openai'

const MODEL = 'gpt-5.5'

const EXTRACT_TOOL = {
  type: 'function',
  function: {
    name: 'record_trip_items',
    description: 'Record real travel bookings found in the text.',
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
              travelers: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Passenger or guest names exactly as printed, e.g. ["MR DAVID SEEBY"]. Used to work out who a leg belongs to on a shared trip. Omit if the booking names nobody.',
              },
              party_size: { type: 'number', description: 'Number of travellers/guests if stated' },
              confidence: { type: 'number', description: '0..1 how sure this is real (not marketing/cancelled)' },
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

// start/end are optional — pass them when the trip is already known (the
// paste flow) to have the model reason about the window; omit them for
// blind inbound-email extraction, where matching to a trip happens after.
export async function extractBookingItems({ text, start, end }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const windowLine = start && end
    ? `Trip window: ${start} to ${end} (inclusive). Only record items whose date falls between ${start} and ${end} (a day either side is fine for red-eyes).\n`
    : `No specific trip window is known yet — record every real booking you find with its actual date, regardless of when it falls.\n`
  const sys =
    `You extract real travel bookings from email/confirmation text.\n` +
    `A confirmation is often sent months before travel — ignore when it was sent; use the travel dates written in the text.\n` +
    windowLine +
    `The text may contain one booking or several. Skip marketing, newsletters, cancelled bookings and anything that isn't a real booking.\n` +
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

  const seen = new Set()
  items = items.filter((it) => {
    if (!it.event_date) return false
    if (start && end) {
      const pad = (d, days) => {
        const x = new Date(d + 'T00:00:00')
        x.setDate(x.getDate() + days)
        return x.toISOString().slice(0, 10)
      }
      const lo = pad(start, -1)
      const hi = pad(end, 1)
      if (it.event_date < lo || it.event_date > hi) return false
    }
    if ((it.confidence ?? 0) < 0.4) return false
    const key = `${it.event_date}|${it.kind}|${(it.title || '').toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return items
}
