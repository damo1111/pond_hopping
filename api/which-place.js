import { preflight } from './_lib/cors.js'
import OpenAI from 'openai'

// Which of these neighbours the photograph was taken at.
//
// This is the only place in the app that looks at what is *in* a
// photograph, and it exists for one situation: several real places sitting
// inside the accuracy of a GPS fix, where no arithmetic can separate them
// because the information is not in the numbers. A stall in Borough Market
// has forty neighbours; the coordinates say "the market", and only the
// picture says which stall.
//
// Two things keep this from becoming a bill:
//
//   - It is called per *stop*, not per photograph, and only for stops that
//     src/lib/placePick.js has already declared ambiguous. On a three-day
//     Roman trip that is a handful out of twenty.
//   - It is given the shortlist. The model is choosing between real
//     neighbours that Foursquare says are there, not naming a building from
//     its own idea of what Rome looks like. "None of these" is an allowed
//     and expected answer, which is what stops it picking the most famous
//     name on the list because it recognises the city.
const MODEL = 'gpt-5.5'

export const MAX_PHOTOS = 3
export const MAX_CANDIDATES = 8

const SYSTEM = `You are told a list of places that are all within a hundred
metres of where some photographs were taken, and shown the photographs. You
say which one of the listed places the photographs were taken at.

Answer only from what is visible: signage, a menu, a shopfront, a building,
a recognisable landmark, the kind of goods on a counter. A photograph of
food tells you it was somewhere serving that food, which may narrow the list
but rarely settles it.

You are choosing from the list. You may not name a place that is not on it.

"none" is the right answer far more often than people expect, and it costs
nothing: a photograph of somebody's dinner, or of the sky, or of a street
that could be any street, does not say where it was taken. Say none, with
low confidence, rather than picking the most famous name on the list because
you recognise the city.`

function schema(names) {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'which',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['place', 'confidence', 'seen'],
        properties: {
          // An enum, so "not on the list" is impossible rather than merely
          // discouraged.
          place: { type: 'string', enum: [...names, 'none'] },
          confidence: { type: 'number', description: '0 to 1.' },
          seen: { type: 'string', description: 'What in the photographs decided it, in a few words. "nothing identifiable" is a fine answer.' },
        },
      },
    },
  }
}

export default async function handler(req, res) {
  if (preflight(req, res)) return
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured' })
    return
  }
  if (!(req.headers.authorization || '').startsWith('Bearer ')) {
    res.status(401).json({ error: 'sign in first' })
    return
  }

  const photos = (Array.isArray(req.body?.photos) ? req.body.photos : [])
    .filter((u) => typeof u === 'string' && /^https:\/\//.test(u))
    .slice(0, MAX_PHOTOS)
  const candidates = (Array.isArray(req.body?.candidates) ? req.body.candidates : [])
    .filter((c) => c && typeof c.name === 'string')
    .slice(0, MAX_CANDIDATES)

  if (!photos.length || candidates.length < 2) {
    res.status(400).json({ error: 'photos and at least two candidates required' })
    return
  }

  const names = [...new Set(candidates.map((c) => c.name))]

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const r = await client.chat.completions.create({
      model: MODEL,
      response_format: schema(names),
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `Within a hundred metres of where these were taken:\n` +
                candidates.map((c) => `- ${c.name}${c.category ? ` (${c.category})` : ''}`).join('\n') +
                `\n\nWhich one were the photographs taken at?`,
            },
            ...photos.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } })),
          ],
        },
      ],
    })

    const answer = JSON.parse(r.choices[0]?.message?.content || '{}')
    res.status(200).json({
      // Never let a name through that was not offered, whatever the schema
      // did or did not enforce on the day.
      place: names.includes(answer.place) ? answer.place : null,
      confidence: Number(answer.confidence) || 0,
      seen: answer.seen ?? null,
    })
  } catch (e) {
    console.error(`which-place: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
