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
  if (!start || !end) {
    res.status(400).json({ error: 'trip start and end required' })
    return
  }

  try {
    const items = await extractBookingItems({ text, start, end })
    res.status(200).json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
