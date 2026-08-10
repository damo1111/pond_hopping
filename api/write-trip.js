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

THE LINE

Texture yes. Events no.

You may write what was near-certainly true of that place, at that hour, in
that season: the light coming up in January, shutters still down in a
neighbourhood at seven in the morning, scooters in Rome. That is what makes
it a memory rather than a log, and none of it is a claim about what they did.

You may not invent a single thing they did. No meal, no venue, no purchase,
no conversation, no encounter that the reconstruction does not carry.
Anything marked confirmed you may write as it happened — a plate of
carbonara, a table, an hour in one room is a lunch and you can say so.
Anything marked possible or unknown you leave out or admit.

Admitting it is usually the better sentence, and it is what a person
actually sounds like:

  "I stayed near the Trevi for the best part of an hour and I genuinely
   cannot tell you what I was doing — lunch, probably."

  "Whatever happened during that stretch has been lost to the record, which
   I rather like. Not everything needs reconstructing."

A gap is allowed to be a gap. Do not fill it. Do not name a restaurant the
reconstruction did not name — if it gives you the street, write the street.

THE WORLD AROUND THEM

The reconstruction may carry "context": what was going on in the world at
the time. Use it only to set a scene, never as a cause. You may write that
it was the week half of Europe's airline systems fell over. You may not
write that it delayed them, or that it is why anything happened, unless
"certain" is true — which means their own record shows it.

Where the reconstruction asked them something and they answered yes, that
answer is a fact and you may write it as one.

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

LENGTH

Length follows the day and nothing else. A day with a dozen episodes earns
several hundred words; a travel day with a flight and a hotel earns a couple
of paragraphs.

If you have been given a sample of how this person writes, match their
vocabulary and their rhythm — never their length. Somebody whose own entries
are one line long has not asked for a one-line chapter; they wrote briefly in
a text box, which is a fact about text boxes. Never write less because they
write short.

RETURN

JSON: { "opening", "days": [ { "date", "title", "note" } ], "closing" }

"opening" is a short reflection to begin on — what the trip turned out to be,
written as somebody would open a journal they meant to keep. Not a summary of
what follows.

"closing" is the trip looked back on: what defined it, the places returned
to, how the days differed from each other. End on the strongest moment the
evidence actually supports, not on a lesson.

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
    `Match the rhythm and the vocabulary — the shape of their sentences, ` +
    `how much they leave out, whether they name things or gesture at them. ` +
    `Do not copy their content, and do not copy how much of it there is: ` +
    `these were typed into a small box and are short for that reason, not ` +
    `because that is how long a day should be.\n\n` +
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
    res.status(200).json({
      opening: out.opening ?? null,
      days: out.days,
      closing: out.closing ?? null,
      voiced: voice.length >= VOICE_NEEDS,
    })
  } catch (e) {
    console.error(`write-trip: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
