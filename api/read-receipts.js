import OpenAI from 'openai'

// Reads photographs and says which of them are receipts.
//
// David keeps receipts by photographing them, which means they arrive in
// the same camera roll as the holiday and land in the same table. This
// looks at a batch and reports what is on each one. It decides nothing:
// whether the reading is good enough to become a cost is settled in
// src/lib/receipt.js, where the rules are testable without an API key.
//
// Same vendor and same key as plan-chat and the booking parser — one AI
// bill for this app, not three.
//
// The client sends photo *ids*, never URLs. The rows are then fetched as
// the signed-in user, so RLS decides what can be looked at: without that,
// this endpoint would happily read any URL anybody posted to it and spend
// David's OpenAI credit doing it.
const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'
const MODEL = 'gpt-5.5'

// Enough to be worth a round trip, small enough that a failure loses
// little and the browser is not holding a request open for minutes.
export const MAX_BATCH = 12

const SYSTEM = `You are reading a photograph and reporting what is on it.

Most of what you are shown will be ordinary holiday photographs — streets,
food, people, views. Those are not receipts. Say so and move on.

A receipt is a printed or emailed record of a payment: a till receipt, a
restaurant bill, a card slip, a ticket with a price on it, an invoice. A
menu is not a receipt. A price tag in a shop window is not a receipt. A
photograph of a bank card is not a receipt.

When it is a receipt, report exactly what is printed. Do not convert
currencies, do not compute anything, and do not fill in what you cannot
read. The total is the final amount actually paid, including tax and
service and after any discount — not the subtotal.

Report the currency as a three-letter ISO code only when the receipt makes
it unambiguous: a printed code, a country-specific tax name, an address, a
card network line. A bare symbol shared by several countries is not
enough — leave the currency out rather than guessing between them.

Be honest in "confidence": it is your confidence that this is a receipt at
all, and low confidence is a perfectly good answer for a blurry corner of
something that might be a bill.`

function schema() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'reading',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['is_receipt', 'confidence', 'merchant', 'total', 'currency', 'date', 'category', 'city'],
        properties: {
          is_receipt: { type: 'boolean' },
          confidence: { type: 'number', description: '0 to 1, that this is a receipt at all.' },
          merchant: { type: ['string', 'null'], description: 'The name at the top, verbatim. Null if unreadable.' },
          total: { type: ['string', 'null'], description: 'The final amount paid, digits and separators exactly as printed.' },
          currency: { type: ['string', 'null'], description: 'Three-letter ISO code, or null if the receipt does not make it unambiguous.' },
          date: { type: ['string', 'null'], description: 'YYYY-MM-DD, only if a full date is printed. Null otherwise — do not infer the year.' },
          category: { type: ['string', 'null'], description: 'What was bought, in a word or two, in plain English.' },
          city: { type: ['string', 'null'], description: 'Town or city from the address, if one is printed.' },
        },
      },
    },
  }
}

function sb(path, token) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token || ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  }).then(async (r) => {
    if (!r.ok) throw new Error(`supabase ${path} ${r.status}: ${await r.text()}`)
    return r.json()
  })
}

async function readOne(client, photo) {
  const r = await client.chat.completions.create({
    model: MODEL,
    response_format: schema(),
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is on this photograph?' },
          // The stored thumbnail when there is one: a receipt is legible at
          // a fraction of a 50MP original, and the originals are large
          // enough that the fetch is the slowest part of this by far.
          { type: 'image_url', image_url: { url: photo.thumb_url || photo.url, detail: 'high' } },
        ],
      },
    ],
  })
  return JSON.parse(r.choices[0]?.message?.content || '{}')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured' })
    return
  }

  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!token) {
    res.status(401).json({ error: 'sign in first' })
    return
  }

  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === 'string') : []
  if (!ids.length) {
    res.status(400).json({ error: 'ids required' })
    return
  }
  if (ids.length > MAX_BATCH) {
    res.status(400).json({ error: `at most ${MAX_BATCH} at a time` })
    return
  }

  try {
    // As the user, so RLS answers "may you look at this" rather than us.
    const list = ids.map(encodeURIComponent).join(',')
    const photos = await sb(`photos?select=id,url,thumb_url,trip_id,taken_on,city&id=in.(${list})`, token)
    if (!photos.length) {
      res.status(200).json({ readings: [] })
      return
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    // One bad photograph must not lose the other eleven — a 404 on one
    // thumbnail is an ordinary event in a batch this size.
    const readings = await Promise.all(
      photos.map(async (photo) => {
        try {
          return { id: photo.id, photo, reading: await readOne(client, photo) }
        } catch (e) {
          console.error(`read-receipts: ${photo.id}: ${e.message}`)
          return { id: photo.id, photo, reading: null, error: e.message }
        }
      })
    )

    res.status(200).json({ readings })
  } catch (e) {
    console.error(`read-receipts: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
