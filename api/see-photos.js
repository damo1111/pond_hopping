import OpenAI from 'openai'

// Look at the photographs.
//
// Everything up to here reconstructs a trip from its skeleton: timestamps
// say when, coordinates say where, the sequence says how somebody moved.
// That is genuinely most of the shape of a trip, and it is also the reason
// the writing stays at arm's length — an hour stationary near Via del
// Tritone can only ever be "you stopped somewhere for about an hour",
// because nothing in the numbers knows whether that was lunch, a shop, or
// waiting for the rain to stop.
//
// The photographs know. They may show the room, the plate, the window, the
// awning with the name on it. Nothing else we have can supply that, and no
// amount of better reasoning over the same coordinates will invent it
// honestly.
//
// The version of photo-reading this replaces looked at six photographs per
// trip, and only where two venue records disagreed about a coordinate. That
// was solving the wrong problem with the right mechanism.
//
// ── On grouping ──────────────────────────────────────────────────────────
//
// The obvious economy is to collapse near-duplicates first and only look at
// one of each. On Rome that does nothing: 286 photographs, grouped by the
// perceptual hash already stored against every row, come to 285. The hash
// is tuned to catch a stylised re-export of the same file, and twenty-three
// burst shots of the same colonnade from slightly different angles are not
// that. Real grouping here is temporal — the 31 segments the day already
// divides into — and it happens after this, not before.
//
// So: every photograph, once, batched.
const MODEL = 'gpt-5.5'

/** Images per request. The instruction is the expensive part of a small
 *  call, so batching pays it fifteen times over a trip rather than 286. */
export const BATCH = 20

/** How much of the image the model gets.
 *
 *  'low' is 85 tokens — a 512px thumbnail. Enough for "indoor, restaurant,
 *  food on the table, window onto a street". Not enough to read the name
 *  off an awning, and the name is usually the thing worth having. 'high' is
 *  765 and can. The caller decides where that is worth paying. */
export const DETAIL = { LOW: 'low', HIGH: 'high' }

const RULES = `You are looking at photographs from somebody's trip so their
travel journal can say what was actually there.

For each image, return one object. Be specific and be brief — this is
evidence for a later pass, not prose.

  id       the id given with the image, copied back exactly
  what     one short phrase: what the photograph is of
  subject  one of: food, drink, architecture, interior, street, people,
           landscape, artwork, document, transport, animal, other
  inside   true if taken indoors, false if outdoors, null if you cannot tell
  text     any legible text in the image — a sign, an awning, a menu, a
           label, a plaque — copied verbatim, exactly as written, including
           the language. This is the single most valuable field: it is what
           turns "somewhere near Via del Tritone" into the name of the
           restaurant. Empty string if there is none you can actually read.
           Never guess at text you cannot make out.
  light    daylight, overcast, rain, golden, dusk, dark, artificial, or null
  notable  anything a person would mention about this photograph and would
           not have guessed from the others — an unusual subject, something
           happening, a view, a person. Empty string if it is an ordinary
           shot of an ordinary thing.

Describe only what is visible. Do not identify a landmark you are not sure
of, do not infer the city, do not guess what a building is from its style.
If a photograph is of a wall, say it is of a wall.

Return JSON: { "seen": [ ... ] }, one object per image, in the order given.`

export default async function handler(req, res) {
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

  const { photos = [], detail = DETAIL.LOW } = req.body || {}
  if (!Array.isArray(photos) || !photos.length) {
    res.status(400).json({ error: 'photos required' })
    return
  }
  if (photos.length > BATCH) {
    res.status(400).json({ error: `${BATCH} at a time` })
    return
  }
  if (detail !== DETAIL.LOW && detail !== DETAIL.HIGH) {
    res.status(400).json({ error: 'detail must be low or high' })
    return
  }

  const usable = photos.filter((p) => p?.id != null && typeof p.url === 'string' && p.url)
  if (!usable.length) {
    res.status(400).json({ error: 'no usable photos' })
    return
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const r = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: RULES },
        {
          role: 'user',
          content: usable.flatMap((p) => [
            { type: 'text', text: `id: ${p.id}` },
            { type: 'image_url', image_url: { url: p.url, detail } },
          ]),
        },
      ],
    })
    const raw = r.choices[0]?.message?.content?.trim()
    if (!raw) {
      res.status(502).json({ error: 'nothing came back' })
      return
    }
    const out = JSON.parse(raw)
    if (!Array.isArray(out.seen)) {
      res.status(502).json({ error: 'no observations came back' })
      return
    }
    res.status(200).json({ seen: out.seen, looked: usable.length })
  } catch (e) {
    console.error(`see-photos: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
