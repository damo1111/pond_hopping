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
// gpt-5.6-sol, which is the model ChatGPT was running when it produced the
// reconstruction this pipeline is measured against. Everything here was on
// gpt-5.5, a version behind, and this is the stage where that matters most.
//
// Worth remembering anyway: the same model id does not buy the same output.
// ChatGPT wraps it in its own system prompt and tools; the API gives us the
// model and nothing else, so the prompt in this file is doing work that was
// invisible over there.
const MODEL = 'gpt-5.6-sol'

const RULES = `You are reconstructing somebody's trip from the record their
photographs left, so that a later stage can write it up. You are not writing
the journal. Do not write prose.

You are given every photograph: local time, latitude and longitude to five
decimal places, in order, day by day. Where the photographs have been looked
at, each row also carries what is actually in the picture — the subject, any
text legible in it, what was happening, the light, and what the person
appears to have been pointing the camera at. You are also given the flights,
any runs or walks recorded, the gaps where no photographs exist, and the
distance covered on foot.

WHAT TO DO WITH IT

Read the coordinates as geography. You know where these places are — name
them. A cluster sitting on a landmark is that landmark.

But the picture outranks the coordinate. A fix beside the Colosseum with a
photograph of a shop window is somebody photographing a shop window near the
Colosseum, and saying so is the whole point of having looked. Where they
disagree, record both.

Read the sequence as movement. A run of coordinates drifting west over ten
minutes is somebody walking west, and naming what they were walking towards
is among the most useful things you can do. Direction, doubling back and the
order things happened in are the shape of a day.

Group the photographs into episodes — a meal, a circuit of a monument, a walk
through a park, a wait at a gate. Twenty photographs of one fountain is one
episode, not twenty events.

Use what they photographed as evidence of what they cared about. Eighteen
attempts at the same column against an evening sky is a different fact from
"visited Trajan's Forum". Recurring subjects across days matter more than
any single picture.

Respect the gaps. Four hours with no photographs cannot be reconstructed, and
saying so plainly beats filling it. Never invent an activity to cover one.

Distances given are straight lines between photographs with the impossible
hops removed, so they are floors. Say so where you use them.

HONESTY

Keep these apart and never promote one to the next:

  confirmed  the photographs or the record show it
  likely     several things point at it and nothing contradicts it
  possible   reasonable, and the evidence is thin
  unknown    cannot be told

Fifty minutes stationary among restaurants is "stopped somewhere for the best
part of an hour" unless a photograph shows a table, a plate, a menu or a room.
Where a venue cannot be established, say the street or the quarter — never
name the nearest business because it happens to be there. This becomes
somebody's memory of their own life, and a plausible invention is worse than
an admitted gap.

WHAT YOU CANNOT SETTLE, ASK

Some things are plausible and unverifiable. A flight that landed hours later
than that route normally takes, on a day a well-known airline IT outage was
running. An unplanned night in an airport city. A travel day with a hole in
it nothing else explains.

Do not assert those and do not drop them. Put them in "ask" as a question
for the person whose trip this is — they were there, and they are the only
corroboration available. Ask in plain language, say what in their own record
made you wonder, and never ask about something the record does not mark.

A public event you merely happen to know about, with nothing in the trip
pointing at it, is not a question. It is scene-setting at most, and it
belongs in "context".

Ask them as open questions and expect a sentence back — "What were you
doing in Piazza Navona for the final hour?" rather than "Were you at dinner
in Piazza Navona?". A yes confirms only what you already guessed; a sentence
tells you the thing nobody could have worked out. Never phrase one so that
yes or no would answer it.

Be sparing. Three good questions are worth more than a dozen, and being
asked twelve things about a weekend is its own kind of failure.

WHAT TO RETURN

JSON only:

{ "days": [ { "date", "title", "episodes": [ { "from", "to", "where",
  "lat", "lon", "what", "shows", "moved", "certainty", "unsure" } ],
  "gaps": [], "on_foot_km" } ],
  "patterns": [], "returned_to": [], "attention": [], "unexplained": [],
  "ask": [ { "on_date", "asks", "because" } ],
  "context": [ { "on_date", "what", "certain" } ] }

"where" is the place, at whatever precision the evidence supports. "lat"
and "lon" are copied from the photographs of that episode, to five decimals,
so a map can put the name where it belongs — never invented, and null where
the episode has no located photograph.
"shows" is what the photographs themselves show, and is empty where none
were looked at. "moved" is how they got there. "unsure" is what you could
not settle. "patterns" is the trip's habits — early mornings, walking over
transport, the same quarter three days running. "attention" is what they
kept photographing. "unexplained" is what stayed a mystery.

"ask" is what only they can settle. "asks" is the question itself, "because"
is the mark in their own record that prompted it.

"context" is what was going on in the world around them that a reader might
want to know, with "certain" true only where the record itself shows it.
Nothing in "context" may be given as a cause of anything in their day.

Titles are three or four words. Everything else is notes, not sentences.`

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

  const { trace } = req.body || {}
  if (!trace?.days?.length) {
    res.status(400).json({ error: 'trace required' })
    return
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const r = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_completion_tokens: 32000,
      messages: [
        { role: 'system', content: RULES },
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
    res.status(200).json(out)
  } catch (e) {
    console.error(`reconstruct-trip: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
