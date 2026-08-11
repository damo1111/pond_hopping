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
decimal places, in order, day by day. Some days also carry "stayed": where
they actually were, with arrival and departure times, from a phone or a
location history that was recording whether or not anybody took a picture. Where the photographs have been looked
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

WHERE THEY WERE, AS OPPOSED TO WHERE THEY PHOTOGRAPHED

"stayed" is the strongest evidence of place in the whole record and the
weakest evidence of activity. Something was recording; it knows they were at
a coordinate from 09:10 to 11:40 and it knows nothing whatever about what
they were doing there.

So use it to place them and to time them, and never to say what happened. An
hour and a half at a coordinate among restaurants is an hour and a half at
that address, not lunch. If a photograph from the same stretch shows a
plate, that is lunch, and the stay is what tells you how long it lasted.

Where it disagrees with a photograph's coordinate, prefer the photograph for
the moment it was taken and the stay for the hours around it: a camera knows
where it was at 12:04, a stay knows where somebody was all afternoon.

Respect the gaps — but check "stayed" before calling one a gap. Four hours
with no photographs is not a mystery if something recorded a stay through
all four of them; it is four hours somewhere, and saying where is the whole
point of having it. A gap is only a gap when nothing at all was watching.

Never invent an activity to cover one.

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

Being asked the same question twice is worse than either. See below.

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

// What they wrote themselves, at the time.
//
// This reached the writing stage and stopped there, which meant the stage
// that decides what happened was working blind next to a written account of
// the same days. It asked "Where did the trip begin?" about a day whose own
// entry opens "Flew Edinburgh → London → Rome", and asked where they stayed
// on a trip whose entry says they moved hotels. Three of the five questions
// left standing on the Rome trip are answered in their own words, one screen
// away.
//
// Evidence and testimony are different things and the testimony wins.
function theirAccount(theirs = {}) {
  const dates = Object.keys(theirs).filter((d) => theirs[d])
  if (!dates.length) return ''
  return (
    `\n\nTHEIR OWN ACCOUNT OF THESE DAYS\n\n` +
    `On these days they wrote an entry themselves, at the time. This is not ` +
    `evidence to be weighed against the photographs — it is testimony from ` +
    `the person who was there, and where it disagrees with the coordinates ` +
    `the coordinates are wrong.\n\n` +
    `Everything it states is settled: write it into the episodes for that ` +
    `day with certainty "certain", using their names for things. Never put ` +
    `something in "ask" or "unexplained" that their own entry already says. ` +
    `Asking somebody what happened on a day they have described is the ` +
    `single worst thing this stage can do.\n\n` +
    dates.map((d) => `${d}:\n"${theirs[d]}"`).join('\n\n')
  )
}

// What they have already been asked, and what they said back.
//
// Without this the reconstruction has no memory: it regenerates the same
// three questions on every run, because the same gap in the trace prompts
// the same doubt. Twenty-one questions were asked about a four-day trip in
// Rome, and the first evening near Santa Maria Maggiore was asked about
// three separate times in three slightly different words.
//
// So an answer is not only a note for the writer at the end — it is evidence
// here, at the point where what happened is decided, and it settles the
// question that produced it for good.
function alreadyKnown({ answered = [], could_not_say = [], already_asked = [] } = {}) {
  if (!answered.length && !could_not_say.length && !already_asked.length) return ''
  const say = (list) => list.map((a) => `- ${a.on_date || 'the trip'}: ${a.asked}`).join('\n')
  let out = `\n\nWHAT THEY HAVE ALREADY TOLD YOU\n\nThis trip has been reconstructed before and these questions were put to them.\n`

  if (answered.length) {
    out +=
      `\nThey answered these. Every one is settled — it is testimony from the ` +
      `person who was there, it outranks anything you can infer from the ` +
      `trace, and where it contradicts the coordinates the coordinates are ` +
      `wrong. Build the episode from what they said, in "what", with ` +
      `certainty "certain". Never ask any of these again in any wording.\n\n` +
      answered
        .map((a) => `- ${a.on_date || 'the trip'}: asked "${a.asked}" — they said: "${a.said}"`)
        .join('\n') +
      '\n'
  }
  if (could_not_say.length) {
    out +=
      `\nThey were asked these and could not remember. Asking again is asking ` +
      `somebody to remember something they have just told you they cannot. ` +
      `Leave the gap in "unexplained" and never ask these again.\n\n` +
      say(could_not_say) +
      '\n'
  }
  if (already_asked.length) {
    out +=
      `\nThese are outstanding — already asked, not yet answered. Do not ` +
      `repeat them or reword them. Ask only what is genuinely new, and if ` +
      `nothing is, return an empty "ask".\n\n` +
      say(already_asked) +
      '\n'
  }
  return out
}

/**
 * The stage itself, with no HTTP around it.
 *
 * Pulled out of the handler so the server-side runner can call it directly
 * rather than making an HTTP request to its own deployment — which is a real
 * round trip, a second cold start, and one more thing to time out between
 * two pieces of code sitting in the same repository.
 *
 * @returns the reconstruction, parsed. Throws with a readable message.
 */
export async function reconstruct({
  trace,
  theirs = {},
  answered = [],
  could_not_say = [],
  already_asked = [],
} = {}) {
  if (!trace?.days?.length) throw new Error('trace required')
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured')

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const r = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    max_completion_tokens: 32000,
    messages: [
      {
        role: 'system',
        content: RULES + theirAccount(theirs) + alreadyKnown({ answered, could_not_say, already_asked }),
      },
      { role: 'user', content: JSON.stringify(trace) },
    ],
  })
  const raw = r.choices[0]?.message?.content?.trim()
  if (!raw) throw new Error('nothing came back')
  const out = JSON.parse(raw)
  if (!Array.isArray(out.days)) throw new Error('no days came back')
  return out
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

  const { trace, theirs = {}, answered = [], could_not_say = [], already_asked = [] } = req.body || {}
  if (!trace?.days?.length) {
    res.status(400).json({ error: 'trace required' })
    return
  }

  try {
    res.status(200).json(await reconstruct({ trace, theirs, answered, could_not_say, already_asked }))
  } catch (e) {
    console.error(`reconstruct-trip: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
