import OpenAI from 'openai'

// The whole trip, in one call, from the coordinates themselves.
//
// This replaces a pipeline that reverse-geocoded every stop through
// Foursquare, sent photographs to a vision model where the candidates
// disagreed, and then asked a writer to build a day out of the residue. On
// Rome that residue was seven moments out of thirty-one, and the seven were
// named things like "Obelisco Agonalis" and "La Cenatio Rotunda" — an
// obelisk and a ruin, standing in for Piazza Navona and the Colosseum.
//
// Handed the same coordinates with no geocoding at all, a model says
// "the northern part of the Roman Forum archaeological zone", "essentially
// on Piazza Navona", "these lie in and around Villa Doria Pamphilj". The
// apparatus was not protecting the output from a model's ignorance. It was
// protecting it from the model's knowledge.
//
// One call per trip, not one per day, because the things worth saying are
// mostly across days: that the Piazza Venezia corridor was crossed six
// times and is the spine of the trip, that ancient Rome was done twice in
// two different passes, that both mornings started before eight.
const MODEL = 'gpt-5.5'

const RULES = `You are reconstructing somebody's trip from the EXIF data of
the photographs they took, and then writing it up as their travel journal.

You are given every photograph: local time, latitude and longitude to five
decimal places, in order, day by day. You are also given their flights, any
runs or walks recorded that day, the gaps where no photographs exist, and
the straight-line distance between consecutive fixes.

WHAT TO DO WITH IT

Read the coordinates as geography. You know where these places are — name
them. A cluster sitting on a landmark is that landmark. Do not hedge a
coordinate that is unambiguous.

Read the sequence as movement, not as a list of locations. A run of
coordinates drifting west over ten minutes is somebody walking west, and
saying where they were walking towards is the single most useful thing you
can do. Direction, doubling back, and the order things happened in are the
story.

Use photographic density as evidence of behaviour. Twenty-three photographs
in ten minutes with almost no movement is deliberate photography of
something. Eighty minutes stationary in the evening is dinner. One
photograph in passing is passing.

Treat photographs that kept their timestamp but lost their GPS as evidence
in their own right. Two of those in the middle of a travel day are somebody
on an aeroplane.

Respect the gaps. Four hours with no photographs cannot be reconstructed,
and saying so plainly is worth more than filling it. Never invent an
activity to cover a gap.

Distances given are straight lines between photographs, so they are floors,
not totals. Say so when you use them.

HONESTY

GPS says where the camera was, not what the person was doing. Where a
cluster sits on a landmark, be confident. Where somebody was stationary
among restaurants and shops, say they stopped there and say you cannot tell
lunch from coffee from shopping. Make that distinction explicitly rather
than flattening everything to the same confidence. Never invent a detail —
not the weather, not how somewhere looked, not what a place is famous for.

WHAT TO WRITE

Return JSON: { "days": [ { "date", "title", "note" } ], "summary" }.

Each note is that day written as a journal entry — past tense, second
person, plain sentences, British English, the way somebody would tell a
friend what they did. Length follows the day: a day with a hundred and
thirty photographs and a dozen distinct places deserves several hundred
words and every one of those places named; a travel day with a flight
deserves a short paragraph. Do not pad and do not compress. Do not write a
day as a bulleted list, and do not quote raw coordinates at the reader.

The title is three or four words — where the day actually went.

The summary is the trip as a whole: the shape of it, the places returned to
more than once, what the pattern of times says about how they travelled,
and how much ground was covered. This is where the observations that span
days belong.`

// Their own words, kept exactly. A model asked to improve a sentence sands
// it down: "guested into the Concorde Room and got chatting to a Scottish
// couple" comes back as "enjoyed lounge access at Heathrow".
function keepTheirs(theirs = {}) {
  const dates = Object.keys(theirs).filter((d) => theirs[d])
  if (!dates.length) return ''
  return (
    `\n\nOn some days this person already wrote their own entry. Those are ` +
    `below. For those days, keep every sentence of what they wrote exactly ` +
    `as it is, word for word, and add around it the places the coordinates ` +
    `name that their account leaves unnamed — where they wrote "a rooftop ` +
    `bar" or "a cheap Italian place" and the trace says which one. Do not ` +
    `restate in numbers something they already said in words. The rest of ` +
    `the day you write as normal.\n\n` +
    dates.map((d) => `${d}:\n"${theirs[d]}"`).join('\n\n')
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

  const { trace, theirs = {}, voice = [] } = req.body || {}
  if (!trace?.days?.length) {
    res.status(400).json({ error: 'trace required' })
    return
  }

  const voiced =
    voice.length >= 3
      ? `\n\nHere is how this person writes, from their own earlier entries. ` +
        `Match the rhythm and the vocabulary — the length of their sentences, ` +
        `how much they leave out, whether they name things or gesture at ` +
        `them. Do not copy their content.\n\n` +
        voice.slice(0, 6).map((s) => `— ${s}`).join('\n')
      : ''

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const r = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: RULES + voiced + keepTheirs(theirs) },
        { role: 'user', content: JSON.stringify(trace) },
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
    res.status(200).json({ days: out.days, summary: out.summary ?? null })
  } catch (e) {
    console.error(`tell-trip: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
