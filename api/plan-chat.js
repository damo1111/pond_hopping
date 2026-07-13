import OpenAI from 'openai'

// The "shit hot chatbot" trip-planning assistant. Runs as a Vercel Node
// function (not a Supabase Edge Function) for the same reason resize-photo.js
// does — this repo's rule is Supabase-only for data, but an LLM call needs a
// real npm SDK and a server-side secret, which Edge Functions (Deno) make
// awkward for the official openai package. Same model (gpt-5.5) and
// OPENAI_API_KEY project secret already used by summarize-trip, so this
// reuses the same billing/credit pool instead of adding a second AI vendor.
const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'
const MODEL = 'gpt-5.5'

function sb(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...opts.headers,
    },
  }).then(async (r) => {
    if (!r.ok) throw new Error(`supabase ${path} ${r.status}: ${await r.text()}`)
    const text = await r.text()
    return text ? JSON.parse(text) : null
  })
}

function slugify(title) {
  return (
    (title || 'trip')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Math.random().toString(36).slice(2, 8)
  )
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'record_preference',
      description:
        "Save a durable fact about how David or Seeby like to travel — something worth remembering for every future trip, not just this conversation. Use it the moment someone states or clearly implies a lasting preference: an airline they refuse to fly again, a cabin class they always book, a style of trip they love or hate (beaches vs cities), pace (packed vs slow), food, budget ceilings, hotel vs Airbnb, aisle vs window, anything like that. Also use it to update a preference that's changed, or soften/retire one that's no longer true.",
      parameters: {
        type: 'object',
        properties: {
          traveler: { type: 'string', enum: ['david', 'seeby', 'both'], description: "Whose preference this is. Default 'both' unless it's clearly one person's alone." },
          category: { type: 'string', enum: ['airline', 'cabin', 'seat', 'accommodation', 'destination_type', 'pace', 'food', 'budget', 'logistics', 'activity', 'other'] },
          key: { type: 'string', description: "Short stable slug, e.g. 'avoid_airline_ba' or 'loves_city_breaks'. Reuse an existing key to update/reinforce it rather than making a near-duplicate." },
          statement: { type: 'string', description: 'One clear sentence, in plain English, stating the preference.' },
          value: { type: 'object', description: 'Small structured form of the same fact, e.g. {"airline":"BA","sentiment":"avoid"}.' },
          strength: { type: 'string', enum: ['hard_rule', 'preference', 'observation'], description: "hard_rule = never/always, no exceptions. preference = a real lean. observation = a hunch worth tracking, not yet confirmed." },
          confidence: { type: 'number', description: '0 to 1. 0.9+ only for something stated explicitly and emphatically.' },
          active: { type: 'boolean', description: 'Set false to retire a preference that no longer holds.' },
          evidence_note: { type: 'string', description: 'One line on where this came from, e.g. "said in chat, 13 Jul 2026".' },
        },
        required: ['traveler', 'category', 'key', 'statement', 'strength', 'confidence'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_itinerary',
      description:
        "Write (or update) a draft itinerary once you have enough to sketch something concrete — doesn't need to be complete or final, a rough skeleton is fine and expected early on. This creates/updates a real draft trip the human sees as an accept/keep-as-draft/discard card. Call it again on the same trip to revise it as the conversation continues.",
      parameters: {
        type: 'object',
        properties: {
          trip_id: { type: 'string', description: 'If continuing an existing draft trip, its id (given to you in context). Omit to create a new one.' },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          traveler: { type: 'string', description: "Whose trip, e.g. 'David Seeby'. Leave blank if it's David's own." },
          start_date: { type: 'string', description: 'YYYY-MM-DD, or omit if unknown' },
          end_date: { type: 'string', description: 'YYYY-MM-DD, or omit if unknown' },
          countries: { type: 'array', items: { type: 'string' }, description: 'ISO country codes, lowercase, e.g. ["gb","fr"]' },
          events: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                event_date: { type: 'string', description: 'YYYY-MM-DD, or omit if not yet dated' },
                title: { type: 'string' },
                note: { type: 'string' },
                city: { type: 'string' },
              },
              required: ['title'],
            },
          },
        },
        required: ['title', 'events'],
      },
    },
  },
]

async function runTool(name, input, ctx) {
  if (name === 'record_preference') {
    const evidence = [{ type: 'chat', note: input.evidence_note || 'stated in planning chat', observed_at: new Date().toISOString().slice(0, 10) }]
    const existing = await sb(
      `traveler_preferences?traveler=eq.${encodeURIComponent(input.traveler)}&key=eq.${encodeURIComponent(input.key)}&select=evidence,confidence`
    )
    const prior = existing?.[0]
    const row = {
      traveler: input.traveler,
      category: input.category,
      key: input.key,
      statement: input.statement,
      value: input.value || {},
      strength: input.strength,
      confidence: prior ? Math.max(prior.confidence, input.confidence) : input.confidence,
      source: 'chat',
      evidence: prior ? [...(prior.evidence || []), ...evidence] : evidence,
      active: input.active !== false,
      updated_at: new Date().toISOString(),
    }
    await sb(`traveler_preferences?on_conflict=traveler,key`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    })
    return { saved: true, key: input.key }
  }

  if (name === 'propose_itinerary') {
    let tripId = input.trip_id || ctx.tripId
    const tripRow = {
      title: input.title,
      subtitle: input.subtitle || null,
      traveler: input.traveler || null,
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      countries: input.countries || [],
      status: 'draft',
    }
    if (tripId) {
      await sb(`trips?id=eq.${tripId}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(tripRow) })
    } else {
      const [created] = await sb('trips', {
        method: 'POST',
        body: JSON.stringify({ ...tripRow, slug: slugify(input.title), sort_order: 0 }),
      })
      tripId = created.id
    }

    await sb(`planned_events?trip_id=eq.${tripId}`, { method: 'DELETE', prefer: 'return=minimal' })
    const events = (input.events || []).map((e) => ({
      trip_id: tripId,
      event_date: e.event_date || null,
      title: e.title,
      note: e.note || null,
      city: e.city || null,
      done: false,
    }))
    if (events.length) await sb('planned_events', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(events) })

    ctx.proposal = { trip_id: tripId, ...tripRow, events }
    return { trip_id: tripId, saved: true, event_count: events.length }
  }

  return { error: `unknown tool ${name}` }
}

function buildSystemPrompt(preferences, tripContext) {
  const prefLines = preferences.length
    ? preferences.map((p) => `- [${p.traveler}/${p.category}, ${p.strength}, confidence ${p.confidence}] ${p.statement}`).join('\n')
    : '(none recorded yet — this is early days, build the picture up as you go)'

  return `You are the trip-planning assistant inside Pond Hopping, a private travel app for David Moritz and his husband David Seeby. You talk like a sharp, warm, well-travelled friend who's genuinely good at this — not a corporate travel-bot. Contractions, dry humour where it fits, never stiff or over-formal. Never pad with disclaimers.

Either David may free-text or dictate (voice-to-text) as much or as little as they want — a single line ("thinking Portugal in October") or a wall of half-formed detail (booked flight, rough dates, budget, vibe). Your job:

1. Read what's given, don't ask about anything already stated or already knowable from remembered preferences below.
2. Ask sharp, specific clarifying questions ONLY where something material is genuinely missing or ambiguous — never a generic checklist. One or two questions at a time, not an interrogation.
3. The moment you have enough to sketch something concrete, call propose_itinerary — a rough skeleton is fine, don't wait for perfection. Keep revising it via the same tool as the conversation adds detail.
4. Whenever someone states or clearly implies a lasting preference (an airline they're done with, a class they always fly, loving city breaks over beaches, whatever) call record_preference immediately — don't wait to be asked, and don't just mention it back in prose without saving it.
5. Weave remembered preferences in naturally when they're relevant (e.g. steer away from an airline they've soured on, default to their usual cabin) — don't recite the list at them.

Remembered preferences:
${prefLines}
${tripContext}

Keep replies tight — a few sentences plus, when relevant, the itinerary proposal (which renders separately as a card, so don't re-type it out in full prose).`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }

  try {
    const { message, threadId: incomingThreadId, tripId, traveler = 'both' } = req.body || {}
    if (!message || !message.trim()) {
      res.status(400).json({ error: 'message required' })
      return
    }

    let threadId = incomingThreadId
    if (!threadId) {
      const [thread] = await sb('plan_chat_threads', {
        method: 'POST',
        body: JSON.stringify({ trip_id: tripId || null, traveler, title: message.slice(0, 60) }),
      })
      threadId = thread.id
    }

    const [history, preferences] = await Promise.all([
      sb(`plan_chat_messages?thread_id=eq.${threadId}&select=role,content&order=created_at.asc`),
      sb(
        `traveler_preferences?active=eq.true&or=(traveler.eq.${traveler},traveler.eq.both)&select=traveler,category,statement,strength,confidence&order=confidence.desc`
      ),
    ])

    let tripContext = ''
    if (tripId) {
      const [trip] = await sb(`trips?id=eq.${tripId}&select=id,title,subtitle,traveler,start_date,end_date,countries,status`)
      const events = await sb(`planned_events?trip_id=eq.${tripId}&select=event_date,title,note,city,done&order=event_date.asc`)
      if (trip) {
        tripContext = `\n\nAlready in progress — draft trip id ${trip.id}, "${trip.title}"${trip.subtitle ? ` (${trip.subtitle})` : ''}, dates ${trip.start_date || '?'} to ${trip.end_date || '?'}. Known so far: ${
          events?.length ? events.map((e) => `${e.event_date || '(no date)'}: ${e.title}${e.note ? ` — ${e.note}` : ''}`).join('; ') : 'nothing logged yet beyond the trip shell.'
        } Pass trip_id "${trip.id}" back on propose_itinerary to keep building on this one instead of starting a new trip.`
      }
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const messages = [
      { role: 'system', content: buildSystemPrompt(preferences || [], tripContext) },
      ...(history || []).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ]

    const ctx = { tripId }
    let finalText = ''
    let iterations = 0
    while (iterations++ < 6) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
      })

      const choice = response.choices[0]
      const msg = choice.message
      finalText = msg.content?.trim() || finalText

      if (choice.finish_reason !== 'tool_calls' || !msg.tool_calls?.length) break

      messages.push(msg)
      for (const call of msg.tool_calls) {
        let result
        try {
          const input = JSON.parse(call.function.arguments || '{}')
          result = await runTool(call.function.name, input, ctx)
        } catch (e) {
          result = { error: e.message }
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
      }
    }

    await sb('plan_chat_messages', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify([
        { thread_id: threadId, role: 'user', content: message, proposal: null },
        { thread_id: threadId, role: 'assistant', content: finalText, proposal: ctx.proposal || null },
      ]),
    })

    res.status(200).json({ threadId, reply: finalText, proposal: ctx.proposal || null })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
