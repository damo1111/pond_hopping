import OpenAI from 'openai'

// The last stage, and the only one allowed to write.
//
// Separate from the reconstruction on purpose. A single call asked to be
// both forensic and literary does neither: it either hedges the prose into
// uselessness — "you appear to have stopped somewhere for approximately an
// hour" — or it lets the writing decide what happened, which is how a
// coherent itinerary gets manufactured out of a gap. Establishing what
// happened and saying it well are different jobs and they conflict.
//
// So this one never sees a coordinate. It is given the reconstruction, with
// its certainties marked, and its whole job is to say it like a person.
const MODEL = 'gpt-5.5'

/** Under this there is nothing to imitate and the result is a parody of a
 *  person. See docs/photos-and-journal.md. */
export const VOICE_NEEDS = 3

const RULES = `You are writing somebody's travel journal from a
reconstruction of a trip they took, built from their own photographs.

This is no longer a report. Never use coordinates, certainty labels, counts
of photographs, or the language of reconstruction. Nobody wants to read that
they "appear to have been stationary for fifty-two minutes".

VOICE

They are remembering the trip some years later. Personal, observant,
understated, warm. Funny only where the thing itself is funny. Specific
without reading like a guidebook, descriptive without reaching. Past tense,
British English.

Never say breathtaking, stunning, magical, vibrant, bustling, hidden gem,
nestled, must-see, or that anywhere was steeped in history. Do not open a
day with the weather unless the weather was the point. Do not finish a day
with a summary of what it meant.

THE RULE THAT MATTERS

Do not create false memories.

Anything marked confirmed you may write as it happened. A plate of carbonara,
a table, an hour in one room: they stopped for lunch and you can say so.

Anything marked possible or unknown you either leave out or admit. Admitting
it is usually better and almost always sounds more like a person:

  "I stayed near the Trevi for the best part of an hour and I genuinely
   cannot tell you what I was doing — lunch, probably."

A gap in the record is allowed to be a gap. "The middle of that day has gone
entirely" is a true sentence and a human one. Do not fill it.

Do not name a restaurant the reconstruction did not name. If it says the
street, write the street.

SHAPE

One chapter a day, in order. Start with how the day started and let the place
unfold through movement — the walking between things matters as much as the
things. Include the small stuff: the wait at the gate, the coffee, the
wandering, the sitting down. Those are usually what somebody actually wants
back, more than another paragraph about a monument.

Do not describe photographs. Collapse them into what was remembered. Twenty
pictures of one fountain is somebody standing at a fountain for a while.

Where the reconstruction says what they kept pointing the camera at, let that
show in what the writing dwells on rather than stating it.

Length follows the day. A day with a dozen episodes earns several hundred
words; a travel day with a flight and a hotel earns a couple of paragraphs.
Do not pad and do not compress.

Then a closing section — how the trip is remembered as a whole. What it
turned out to be about, the places returned to, how the days differed. End on
the strongest moment the evidence actually supports, not a summing-up.

RETURN

JSON: { "days": [ { "date", "title", "note" } ], "summary" }

Titles are three or four words and name where the day went.`

// Their own words, kept exactly. A model asked to improve a sentence sands
// it down: "guested into the Concorde Room and got chatting to a Scottish
// couple" comes back as "enjoyed lounge access at Heathrow".
function keepTheirs(theirs = {}) {
  const dates = Object.keys(theirs).filter((d) => theirs[d])
  if (!dates.length) return ''
  return (
    `\n\nOn these days they wrote their own entry at the time. Keep every ` +
    `sentence of it exactly as it is, word for word, and write the rest of ` +
    `the day around it. What you add is what they left unnamed — where they ` +
    `wrote "a rooftop bar" or "a cheap Italian place" and the reconstruction ` +
    `says which one. Do not restate in numbers something they said in words: ` +
    `under "a long run", the distance is padding and reads as padding.\n\n` +
    dates.map((d) => `${d}:\n"${theirs[d]}"`).join('\n\n')
  )
}

function inTheirVoice(samples = []) {
  if (samples.length < VOICE_NEEDS) return ''
  return (
    `\n\nHere is how this person writes, from their own earlier entries. ` +
    `Match the rhythm and the vocabulary — the length of their sentences, ` +
    `how much they leave out, whether they name things or gesture at them. ` +
    `Do not copy their content.\n\n` +
    samples.slice(0, 6).map((s) => `— ${s}`).join('\n')
  )
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
  if (!(req.headers.authorization || '').startsWith('Bearer ')) {
    res.status(401).json({ error: 'sign in first' })
    return
  }

  const { reconstruction, theirs = {}, voice = [] } = req.body || {}
  if (!reconstruction?.days?.length) {
    res.status(400).json({ error: 'reconstruction required' })
    return
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const r = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: RULES + inTheirVoice(voice) + keepTheirs(theirs) },
        { role: 'user', content: JSON.stringify(reconstruction) },
      ],
    })
    const raw = r.choices[0]?.message?.content?.trim()
    if (!raw) {
      res.status(502).json({ error: 'nothing came back' })
      return
    }
    const out = JSON.parse(raw)
    if (!Array.isArray(out.days)) {
      res.status(502).json({ error: 'no days came back' })
      return
    }
    res.status(200).json({ days: out.days, summary: out.summary ?? null, voiced: voice.length >= VOICE_NEEDS })
  } catch (e) {
    console.error(`write-trip: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
