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
              action: {
                type: 'string',
                enum: ['add', 'cancel'],
                description:
                  'add for a booking that now exists; cancel when the email says a booking has been cancelled, refunded or voided. Default add.',
              },
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
              // Everything the confirmation email prints that the app already
              // knows how to render. Without these an imported flight arrives
              // with a title and a date and nothing else, so its card shows
              // "—" for both airports and TBC for every field — while the same
              // flight typed in by hand shows a tail, a route and a terminal.
              detail: {
                type: 'object',
                description: 'Structured fields printed in the confirmation. Omit anything not stated — never guess.',
                properties: {
                  flight_number: { type: 'string', description: 'e.g. "AY1336"' },
                  airline: { type: 'string', description: 'Full name, e.g. "Finnair"' },
                  operated_by: { type: 'string', description: 'If a codeshare names a different operator' },
                  dep_airport: { type: 'string', description: 'IATA, e.g. "LHR"' },
                  arr_airport: { type: 'string', description: 'IATA, e.g. "HEL"' },
                  dep_city: { type: 'string' },
                  arr_city: { type: 'string' },
                  dep_terminal: { type: 'string' },
                  arr_terminal: { type: 'string' },
                  seat: { type: 'string' },
                  cabin: { type: 'string', description: 'e.g. "Business"' },
                  booking_ref: { type: 'string', description: 'PNR or record locator' },
                  ticket: { type: 'string', description: 'e-ticket number' },
                  confirmation: { type: 'string', description: 'Hotel/stay confirmation code' },
                  address: { type: 'string' },
                  room: { type: 'string' },
                  nights: { type: 'number' },
                  guests: { type: 'number' },
                  breakfast: { type: 'boolean' },
                  host: { type: 'string', description: 'Airbnb host or property manager' },
                  listing: { type: 'string', description: 'URL of the listing, if printed' },
                  total: { type: 'string', description: 'Amount paid, as printed including its currency' },
                },
              },
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

// The model reads PDFs itself, which is the whole reason attachments are
// passed through rather than run through a text extractor first: an e-ticket
// is as often a scan as it is generated text, and a layout-aware read of a
// two-column itinerary beats whatever a PDF-to-text pass makes of it.
function fileParts(files) {
  return files
    .filter((f) => f?.base64)
    .map((f) => ({
      type: 'file',
      file: { filename: f.name || 'attachment.pdf', file_data: `data:application/pdf;base64,${f.base64}` },
    }))
}

// start/end are optional — pass them when the trip is already known (the
// paste flow) to have the model reason about the window; omit them for
// blind inbound-email extraction, where matching to a trip happens after.
// files are PDF attachments (see _lib/attachments.js), read alongside the
// body text rather than instead of it: the forward's own covering note
// often carries the context the attachment leaves out.
export async function extractBookingItems({ text, start, end, files = [] }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const windowLine = start && end
    ? `Trip window: ${start} to ${end} (inclusive). Only record items whose date falls between ${start} and ${end} (a day either side is fine for red-eyes).\n`
    : `No specific trip window is known yet — record every real booking you find with its actual date, regardless of when it falls.\n`
  const sys =
    `You extract real travel bookings from email/confirmation text.\n` +
    `A confirmation is often sent months before travel — ignore when it was sent; use the travel dates written in the text.\n` +
    windowLine +
    `The text may contain one booking or several. Skip marketing, newsletters and anything that isn't a real booking.\n` +
    // Cancellations used to be skipped, which left the cancelled flight
    // sitting in somebody's itinerary looking booked. Recorded instead, and
    // matched against what is already on the trip when it is reviewed.
    `A cancellation is not junk: if the email says a booking has been cancelled, refunded or voided, record it with action "cancel" and every identifier it prints — the booking reference and the flight number especially, since those are what identify which booking to remove. Give it the date of the travel being cancelled, not the date of the email.\n` +
    `Normalise titles like the app does: flights "BA16 SYD → LHR", stays "Airbnb — <name>, <town>", dinners "Dinner at <place>".` +
    (files.length
      ? `\nAttached PDFs are part of the same forward — read them as carefully as the body, and do not record the same booking twice if it appears in both.`
      : '')

  const attachments = fileParts(files)
  const userContent = attachments.length
    ? [{ type: 'text', text: String(text || '(no message body)').slice(0, 12000) }, ...attachments]
    : String(text).slice(0, 12000)

  const ask = (content) =>
    client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content },
      ],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'function', function: { name: 'record_trip_items' } },
    })

  // A rejected or oversized attachment must not cost us the body text as
  // well — an email that forwards both is the common case, and half an
  // import beats none.
  let response
  try {
    response = await ask(userContent)
  } catch (err) {
    if (!attachments.length || !String(text || '').trim()) throw err
    console.error('extraction with attachments failed, retrying text-only:', err.message)
    response = await ask(String(text).slice(0, 12000))
  }

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
    // action is part of the identity: an email that both cancels one leg and
    // rebooks it lands as two items with the same date, kind and title, and
    // collapsing them to one would drop half the story.
    it.action = it.action === 'cancel' ? 'cancel' : 'add'
    const key = `${it.action}|${it.event_date}|${it.kind}|${(it.title || '').toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return items
}
