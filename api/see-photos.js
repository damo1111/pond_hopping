import { preflight } from './_lib/cors.js'
import OpenAI from 'openai'
import { BATCH } from '../src/lib/seeing.js'

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
// Luna, not Sol, and the reason is minutes rather than pence.
//
// Sol is the reasoning tier. Put on "what is in this photograph", 286 times,
// it thinks before every answer: a batch of ten took over a minute, which is
// half an hour for a trip, watched. Luna is the fast tier of the same
// family, and describing what is visible in a picture is not a reasoning
// problem — it is a looking problem. This was GPT's own advice, which I
// dismissed as premature optimisation. It was not: it was latency.
//
// Sol stays where it earns its keep, on reconstruct-trip and write-trip.
//
// If Luna cannot take an image the first call fails, so it falls back to Sol
// rather than leaving somebody with a trip that will not read. Slow beats
// broken, and the log says which happened.
const MODEL = 'gpt-5.6-luna'
const FALLBACK = 'gpt-5.6-sol'

/** How much of the image the model gets.
 *
 *  'low' is 85 tokens — a 512px thumbnail. Enough for "indoor, restaurant,
 *  food on the table, window onto a street". Not enough to read the name
 *  off an awning, and the name is usually the thing worth having. 'high' is
 *  765 and can. The caller decides where that is worth paying. */
export const DETAIL = { LOW: 'low', HIGH: 'high' }
export { BATCH }

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

/**
 * The looking itself, with no HTTP around it.
 *
 * Pulled out so the server-side worker can call it directly. The handler
 * below is the same function with a request and a response bolted on, and
 * the browser still uses that — the seeing runs in both places now, and
 * whichever gets to a photograph first marks it read so nobody pays twice.
 *
 * @returns { seen, looked }. Throws with a readable message.
 */
export async function look(photos = [], detail = DETAIL.LOW) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured')
  if (!Array.isArray(photos) || !photos.length) throw new Error('photos required')
  if (photos.length > BATCH) throw new Error(`${BATCH} at a time`)
  if (detail !== DETAIL.LOW && detail !== DETAIL.HIGH) throw new Error('detail must be low or high')

  const usable = photos.filter((p) => p?.id != null && typeof p.url === 'string' && p.url)
  if (!usable.length) throw new Error('no usable photos')

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const ask = (model) => client.chat.completions.create({
    model,
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

  let r
  try {
    r = await ask(MODEL)
  } catch (e) {
    console.error(`see-photos: ${MODEL} failed (${e.message}) — falling back to ${FALLBACK}`)
    r = await ask(FALLBACK)
  }
  const raw = r.choices[0]?.message?.content?.trim()
  if (!raw) throw new Error('nothing came back')
  const out = JSON.parse(raw)
  if (!Array.isArray(out.seen)) throw new Error('no observations came back')
  return { seen: out.seen, looked: usable.length }
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

  const { photos = [], detail = DETAIL.LOW } = req.body || {}
  try {
    res.status(200).json(await look(photos, detail))
  } catch (e) {
    console.error(`see-photos: ${e.message}`)
    // The shape of the complaint decides the status: a bad request is the
    // caller's, anything else is ours or the model's.
    const mine = /required|at a time|must be low or high|no usable/.test(e.message)
    res.status(mine ? 400 : 502).json({ error: e.message })
  }
}
