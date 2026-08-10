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

const RULES = `You are extracting evidence from a batch of somebody's travel
photographs, as one stage of reconstructing a trip they took years ago.

You are NOT writing a journal and NOT telling a story. A later stage does
that. Your job is to establish what is actually there.

Each image comes with the time and coordinates recorded when it was taken.
Those are given to you as text — you cannot read metadata out of an image
and must not try. Use them as corroboration, never as an override: a
coordinate beside the Colosseum does not mean the photograph is of the
Colosseum, and if the picture shows a shop window then it shows a shop
window.

THE RULE THAT MATTERS

Keep observation and inference apart, and never promote one to the other.
Do not assert an activity because it would be normal for a tourist. Fifty
minutes stationary in a building with restaurants in it is not lunch unless
the photographs show food, a table, a menu, a receipt or a room. Prefer
leaving something unknown to giving a confident answer that is unsupported.
These become somebody's memories, and a plausible invention is worse than a
gap.

FOR EACH IMAGE

  id          copied back exactly as given
  subject     one of: food, drink, architecture, interior, street, people,
              landscape, artwork, document, transport, animal, other
  what        one short phrase: what the photograph is actually of
  inside      true indoors, false outdoors, null if you cannot tell
  text        text you can genuinely read — a sign, an awning, a menu, a
              plaque, a station name, a street name — copied verbatim in
              its own language. The most valuable field here: it is what
              turns "somewhere near Via del Tritone" into the name of the
              place. Never guess at letters you cannot make out. Skip
              decorative and irrelevant text. Empty string if there is none.
  place       the specific venue or landmark, ONLY if the picture itself
              shows it — a named frontage, an unmistakable facade. Empty
              string otherwise. Do not name the nearest business merely
              because it exists.
  doing       what is visibly happening: eating, walking, waiting at a
              gate, on a train, in a museum, shopping, resting. Empty
              string if the photograph does not show.
  light       daylight, overcast, rain, golden, dusk, dark, artificial
  weather     only if visible — wet ground, snow, cloud, clear. Empty
              otherwise.
  crowded     busy, some people, empty, or null
  notable     anything a person would mention and would not have guessed
              from the other photographs. Empty string if it is an ordinary
              shot of an ordinary thing.
  sure        0 to 1, how confident you are in what and place

WHY IT WAS TAKEN

This is the part that makes the trip theirs rather than an itinerary.
Twenty-three photographs of Trajan's Forum says somebody was interested in
something. If eighteen of them are attempts at the same column against the
evening sky, that is a different memory from "visited Trajan's Forum", and
only you can see it.

  attention   what the person was actually pointing the camera at
  again       true if this is another attempt at the same shot as a
              neighbouring image — a reframing, a re-exposure, a wait for
              the light
  composed    true if the framing looks deliberate rather than a snapshot

Return JSON: { "seen": [ ... ] }, one object per image, in the order given.
Use empty strings and nulls freely. A short honest object beats a long
speculative one, and every field you fill is paid for twice.`

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
          // The time and place go over as text because they cannot go over
          // any other way: the API decodes the image and sends pixels, so a
          // vision model never sees EXIF. Asking one for aperture or bearing
          // returns twenty invented fields an image. This app strips EXIF at
          // upload anyway — photoResize re-encodes through a canvas, on
          // purpose, so the stored file carries no GPS at all.
          content: usable.flatMap((p) => [
            {
              type: 'text',
              text: [`id: ${p.id}`, p.at && `taken ${p.at}`, p.lat != null && `at ${p.lat}, ${p.lon}`]
                .filter(Boolean)
                .join(' · '),
            },
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
