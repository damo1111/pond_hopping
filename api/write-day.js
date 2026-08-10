import OpenAI from 'openai'

// Write the day. Do not report it.
//
// Three versions of this have now been assembled from string templates,
// and every one read like a database describing itself: "121 photographs
// between 09:14 and 21:40", then "La Cenatio Rotunda, then Nanní, Casa
// Museo Alberto Moravia", then "The longest stop was the Roman Forum —
// 1.9 hours from 13:16." Better facts each time, and the same sentence
// shape, because a template cannot write a day. It can only fill slots.
//
// Meanwhile the entry David wrote himself for the same trip says he
// "guested into the Concorde Room at Heathrow and got chatting to a
// Scottish couple heading to South Africa". That is the bar, and no
// amount of tuning a template gets near it.
//
// So the facts are gathered by code — flights, runs, the places you
// actually stopped, in the trip's own time — and the writing is done by
// something that can write. The facts are still the only input: this is
// asked to arrange what it is given, never to add to it.
const MODEL = 'gpt-5.5'

// Under this there is nothing to imitate and the result is a parody of a
// person. See docs/photos-and-journal.md.
export const VOICE_NEEDS = 3

const RULES = `You are writing one day of somebody's travel journal, from
facts recorded at the time.

The facts are all you have and all you may use. Do not add a detail that is
not in them — not the weather, not how somewhere looked, not how the day
felt, not what a place is famous for. If the facts are thin, the entry is
short. A short true entry is worth more than a long one with invented
colour in it, and the person reading it was there and will know.

Write it as a person would tell a friend what they did. Past tense, plain
sentences, no adjectives doing work the facts do not support. Never begin
with "The longest stop was" or any other phrasing that describes a
measurement rather than a day.

Times: use them the way people do. "just after seven", "the middle of the
afternoon", "not far off ten". Exact clock times only where the exactness
is the point, like a flight.

Do not editorialise, do not summarise at the end, do not say the day was
lovely or memorable or well spent. Two to four sentences. British English.`

function voicePrompt(samples = []) {
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

  const { facts, voice = [], theirs = null } = req.body || {}
  if (!facts || typeof facts !== 'object') {
    res.status(400).json({ error: 'facts required' })
    return
  }

  // Their own words, kept exactly. The blend weaves around them and never
  // rewrites them — a model asked to improve a sentence will sand it down,
  // and "guested into the Concorde Room and got chatting to a Scottish
  // couple" comes back as "enjoyed lounge access at Heathrow".
  const keep = theirs
    ? `\n\nThis person already wrote about this day, in these words:\n\n"${theirs}"\n\n` +
      `Keep every sentence of that exactly as it is, word for word. Add the ` +
      `facts around it — where they were and when — where those genuinely ` +
      `add something their own account leaves out. If the facts add nothing, ` +
      `return their words unchanged.`
    : ''

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const r = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: RULES + voicePrompt(voice) + keep },
        { role: 'user', content: JSON.stringify(facts) },
      ],
    })
    const text = r.choices[0]?.message?.content?.trim()
    if (!text) {
      res.status(502).json({ error: 'nothing came back' })
      return
    }
    res.status(200).json({ text, voiced: voice.length >= VOICE_NEEDS })
  } catch (e) {
    console.error(`write-day: ${e.message}`)
    res.status(502).json({ error: e.message })
  }
}
