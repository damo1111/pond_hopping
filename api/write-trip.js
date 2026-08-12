import { preflight } from './_lib/cors.js'
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
// gpt-5.6-sol, which is the model ChatGPT was running when it produced the
// reconstruction this pipeline is measured against. Everything here was on
// gpt-5.5, a version behind, and this is the stage where that matters most.
//
// Worth remembering anyway: the same model id does not buy the same output.
// ChatGPT wraps it in its own system prompt and tools; the API gives us the
// model and nothing else, so the prompt in this file is doing work that was
// invisible over there.
const MODEL = 'gpt-5.6-sol'

/** Under this there is nothing to imitate and the result is a parody of a
 *  person. See docs/photos-and-journal.md. */
export const VOICE_NEEDS = 3

const RULES = `You are writing somebody's travel journal from a
reconstruction of a trip they took, built from their own photographs.

This is no longer a report. Never use coordinates, certainty labels, counts
of photographs, or the language of reconstruction. Nobody wants to read that
they "appear to have been stationary for fifty-two minutes".

VOICE

First person, past tense, British English. "I was already around the Roman
Forum", not "you were". It is their journal and they are writing it.

They are remembering the trip some years later. Personal, observant,
understated, warm. Funny only where the thing itself is funny. Specific
without reading like a guidebook, descriptive without reaching.

Never say breathtaking, stunning, magical, vibrant, bustling, hidden gem,
nestled, must-see, or that anywhere was steeped in history. Do not open a
day with the weather unless the weather was the point. Do not finish a day
with a summary of what it meant.

RHYTHM

This matters as much as the words. Vary the length of things hard. A long
observant sentence, then three words on its own line. A paragraph that is one
sentence. Some that are one clause.

Used well it is the difference between a report and somebody thinking:

  The real thing has weight.

  It is theatrical almost to the point of comedy.

  And somehow it works.

Do not do it constantly — it stops working the moment it becomes the only
move. Long stretches of even, unbroken paragraphs are the failure to avoid.

You are also allowed to think about travel, not only report it. An
observation about what trips are like, or what you notice about your own
habits, earns its place where the day actually prompts it. That is the
difference between a journal and an itinerary. One or two a chapter, never
more, and never as a moral.

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

WHAT THEY TOLD YOU

"answered" is what they said when asked. It is the only thing in the whole
reconstruction that comes from the person who was actually there, so it
outranks every inference beside it, and where they contradict the
coordinates, they are right and the coordinates are wrong.

Use their words. If they say "a pasta-making course at Eatalian Cooks, then
dinner", that is what happened and you write it as a fact.

"could_not_say" is what they were asked and could not remember. Do not fill
those in. Say so, lightly, the way somebody does about their own life:

  "I stopped somewhere near the Trevi for the best part of an hour and no
   longer have the faintest idea what for." 

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

THREADS

The reconstruction carries "patterns", "returned_to" and "attention": what
they did repeatedly, where they kept ending up, what they kept photographing.
Do not save these for the closing. Weave them through the days, at the point
in the story where the reader would notice them too — the third time somebody
crosses the same square is when it becomes a compass point, and that
observation belongs there, in that chapter, not in a summary at the end.

A trip read as a set of independent days is the single most common way this
comes out flat.

LENGTH

Length follows the day and nothing else. It is not a summary and there is no
budget. Under-writing a full day is the more likely failure here and it is
the worse one.

To calibrate: a day with a hundred photographs and a dozen distinct places
across twelve hours is somewhere around eight hundred to twelve hundred
words, with every one of those places in it. A day with two flights and
twenty-eight photographs is two or three hundred. If a dense day comes out
at three hundred words, you have written a summary of it and thrown the day
away.

The reconstruction gives you episodes. Roughly a hundred words each is the
right density — ten episodes is a thousand words, and if ten episodes came
out as four hundred you have listed them rather than told them.

If you have been given a sample of how this person writes, match their
vocabulary and their rhythm — never their length. Somebody whose own entries
are one line long has not asked for a one-line chapter; they wrote briefly in
a text box, which is a fact about text boxes. Never write less because they
write short.

EVERY DAY

One chapter for every day in the reconstruction, in order, none left out. A
day with a flight and almost no photographs still gets its paragraph — it
was a day of the trip and its absence is more conspicuous than its
thinness. Never silently drop one because there is little to say.

RETURN

JSON: { "opening", "days": [ { "date", "title", "note" } ], "closing" }

"opening" is a short reflection to begin on, two or three short paragraphs.
It is not about this trip's itinerary and not a summary of what follows —
it is what the trip turned out to be, the kind of thing somebody writes at
the top of a journal months afterwards when they already know how it went.
It is allowed to start somewhere general about travel and arrive at this
particular trip.

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
    `\n\nTHEIR OWN ACCOUNT — THIS OVERRIDES EVERYTHING ABOVE\n\n` +
    `On these days they wrote their own entry, at the time. It is the most ` +
    `reliable thing in this entire request: written by the person who was ` +
    `there, on the day. The photographs are evidence; this is testimony.\n\n` +
    `Every fact in it is true and must appear in your chapter for that day. ` +
    `You may NEVER write that something is forgotten, unknown or lost when ` +
    `their entry states it. If they wrote "Flew Edinburgh to London to Rome", ` +
    `the day does not begin "somewhere north of London, though I can no ` +
    `longer say exactly where". That is the worst thing you can do here: it ` +
    `tells somebody their own memory has gone while they are looking at it.\n\n` +
    `Keep their distinctive sentences word for word. A Scottish couple ` +
    `heading to South Africa, a phone call to Matt, the name of a hotel — ` +
    `these are what nothing else in the pipeline can recover, and putting ` +
    `them in your own words loses them. Weave the photographs around their ` +
    `sentences, never in place of them.\n\n` +
    `Where their account and the photographs describe the SAME thing, say it ` +
    `once, using their sentence and the better name. They wrote "moved ` +
    `hotels to Hotel 10" and the pictures show H10 Palazzo Galla: that is ` +
    `one move to one hotel, written once, with the full name in it. Never ` +
    `narrate the same event twice because two sources mentioned it, and ` +
    `never leave a contradiction standing — they were there, so their ` +
    `version is the true one and the evidence only adds detail to it.\n\n` +
    `Do not restate in numbers something they said in words: under "a long ` +
    `run", the distance is padding and reads as padding.\n\n` +
    dates.map((d) => `${d}:\n"${theirs[d]}"`).join('\n\n')
  )
}

// One day changed, so write one day.
//
// Somebody adding a photograph to a trip of two hundred and eighty-six does
// not want the other eleven chapters rewritten. They are expensive, and —
// worse — the writing is not deterministic, so chapters already read, liked
// and shown to somebody come back different without being asked. A new
// photograph belongs to a day. That day is what can have changed.
//
// The whole reconstruction still goes over, because a day cannot be written
// without knowing what the trip around it was: the third crossing of the
// same square is only worth remarking on if you know about the first two.
function onlyThese(dates = []) {
  if (!dates.length) return ''
  return (
    `\n\nONLY THESE DAYS\n\n` +
    `Write chapters for these dates and no others: ${dates.join(', ')}.\n\n` +
    `The rest of this trip has already been written and is being kept word ` +
    `for word. You are given all of it so that what you write sits inside ` +
    `the same trip — the patterns, the places returned to, what came before ` +
    `and after — but "days" comes back holding only the dates above.\n\n` +
    `Leave "opening" and "closing" out entirely. They are about the trip as ` +
    `a whole, that has not changed, and rewriting them would replace ` +
    `something somebody has already read for no reason.`
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

/**
 * The writing, with no HTTP around it, so the server-side runner can reach
 * it without posting to its own deployment.
 *
 * @returns { opening, days, closing, voiced }. Throws with a readable message.
 */
export async function writeUp({ reconstruction, theirs = {}, voice = [], only = [] } = {}) {
  if (!reconstruction?.days?.length) throw new Error('reconstruction required')
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured')

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const r = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    // Reasoning counts against this, and a whole trip of chapters is the
    // longest thing the app asks anybody to write. Room for a dozen days
    // at a thousand words each, plus the thinking to get there.
    max_completion_tokens: 32000,
    messages: [
      { role: 'system', content: RULES + onlyThese(only) + inTheirVoice(voice) + keepTheirs(theirs) },
      { role: 'user', content: JSON.stringify(reconstruction) },
    ],
  })
  const raw = r.choices[0]?.message?.content?.trim()
  if (!raw) throw new Error('nothing came back')
  const out = JSON.parse(raw)
  if (!Array.isArray(out.days)) throw new Error('no days came back')
  return {
    opening: out.opening ?? null,
    days: out.days,
    closing: out.closing ?? null,
    voiced: voice.length >= VOICE_NEEDS,
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

  const { reconstruction, theirs = {}, voice = [], only = [] } = req.body || {}
  if (!reconstruction?.days?.length) {
    res.status(400).json({ error: 'reconstruction required' })
    return
  }

  try {
    res.status(200).json(await writeUp({ reconstruction, theirs, voice, only }))
  } catch (e) {
    console.error(`write-trip: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
