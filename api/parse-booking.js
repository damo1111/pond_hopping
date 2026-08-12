// The zero-setup path to the same magic as the Gmail scan, minus Google.
// The user pastes (or forwards → copies) a booking email; we run the exact
// same extraction and hand back structured events to review. No OAuth, no
// console, no inbox access — just text in, trip items out.
import { extractBookingItems } from './_lib/extractBookingItems.js'

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
  // The window is optional now. It was required because every caller had a
  // trip already — which is exactly what made "paste a confirmation" a route
  // you could only take after building the thing the confirmation describes.
  // extractBookingItems has always handled its absence: with no window it
  // records every real booking it finds with its actual date, which is what
  // the front-door paste needs in order to work the trip out afterwards.
  const window = start && end ? { start, end } : {}

  try {
    const items = await extractBookingItems({ text, ...window })
    res.status(200).json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
