// Pond Hopping as an MCP server. Connect it to Claude, ChatGPT or Gemini
// and your own assistant can read your travel history and write to it —
// which is how you backfill years of trips without Pond Hopping ever
// holding your Google credentials. Your assistant already has your inbox;
// this is the socket it plugs into.
//
// Stateless streamable-HTTP transport: every POST is a self-contained
// JSON-RPC 2.0 message and we answer with application/json. No sessions,
// no SSE, which is all a serverless function can honestly support.
//
// Auth is the same opaque token as the calendar feed, accepted either as
// `?key=` (for clients that only take a URL) or `Authorization: Bearer`.
import { extractBookingItems } from './_lib/extractBookingItems.js'

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'
const PROTOCOL_VERSION = '2025-06-18'

async function rpc(fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`)
  return r.json()
}

const TOOLS = [
  {
    name: 'list_trips',
    description:
      'List every trip in the user\'s Pond Hopping travel log, newest first, with dates, countries and how much is logged against each. Use this to orient before answering anything about where they have been.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_trip',
    description:
      'Full detail for one trip: flights (with who flew which leg), planned events, journal entries and members. Get the slug from list_trips first.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Trip slug from list_trips' } },
      required: ['slug'],
    },
  },
  {
    name: 'get_stats',
    description:
      'Totals across the whole travel log: trips, flights, distance flown, countries visited, journal entries, photos.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_trip',
    description:
      'Create a new trip. Use when backfilling a trip that is not yet in the log. Only create a trip when there is real evidence it happened — a hotel folio, a checkout receipt, local transport, a post-stay email. A flight booking alone proves intent, not travel, and cancellation or refund emails should stop you creating it at all.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'e.g. "Singapore & Malaysia"' },
        slug: { type: 'string', description: 'url-safe, unique, e.g. "singapore-feb-2026"' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD' },
        countries: {
          type: 'array',
          items: { type: 'string' },
          description: 'lowercase ISO codes, e.g. ["sg","my"]',
        },
      },
      required: ['title', 'slug'],
    },
  },
  {
    name: 'add_events',
    description:
      'Add itinerary items (stays, meals, activities, transport) to an existing trip. The user reviews them in the app afterwards.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              event_date: { type: 'string', description: 'YYYY-MM-DD' },
              end_date: { type: 'string' },
              start_time: { type: 'string', description: 'HH:MM 24h' },
              city: { type: 'string' },
              kind: { type: 'string', enum: ['flight', 'hotel', 'transport', 'activity', 'place', 'other'] },
              note: { type: 'string' },
            },
            required: ['title', 'event_date'],
          },
        },
      },
      required: ['slug', 'items'],
    },
  },
  {
    name: 'parse_booking',
    description:
      'Extract structured travel items from the raw text of a booking confirmation email. Returns items without saving them — pass them to add_events once the user has a trip to attach them to.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The email body' },
        start: { type: 'string', description: 'Optional trip start YYYY-MM-DD to filter by' },
        end: { type: 'string', description: 'Optional trip end YYYY-MM-DD to filter by' },
      },
      required: ['text'],
    },
  },
]

async function callTool(token, name, args) {
  switch (name) {
    case 'list_trips':
      return rpc('api_list_trips', { t: token })
    case 'get_trip':
      return rpc('api_get_trip', { t: token, p_slug: args.slug })
    case 'get_stats':
      return rpc('api_stats', { t: token })
    case 'create_trip':
      return rpc('api_create_trip', {
        t: token,
        p_title: args.title,
        p_slug: args.slug,
        p_start: args.start_date || null,
        p_end: args.end_date || null,
        p_countries: args.countries || [],
      })
    case 'add_events':
      return rpc('api_add_events', { t: token, p_slug: args.slug, p_items: args.items || [] })
    case 'parse_booking':
      return { items: await extractBookingItems({ text: args.text, start: args.start, end: args.end }) }
    default:
      throw new Error(`unknown tool: ${name}`)
  }
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

export default async function handler(req, res) {
  // Some clients probe with GET before POSTing. Answering 405 with the
  // Allow header is the documented way to say "POST only, no SSE here".
  if (req.method === 'GET') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'This MCP endpoint is POST-only (stateless streamable HTTP).' })
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }

  const auth = req.headers.authorization || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null
  const token = bearer || String(req.query.key || '')

  const msg = req.body || {}
  const id = msg.id ?? null

  try {
    switch (msg.method) {
      case 'initialize':
        res.status(200).json(
          ok(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: 'pond-hopping', version: '1.0.0' },
          })
        )
        return

      // Notifications have no id and expect no response body.
      case 'notifications/initialized':
        res.status(202).end()
        return

      case 'tools/list':
        res.status(200).json(ok(id, { tools: TOOLS }))
        return

      case 'tools/call': {
        if (!/^[0-9a-f-]{36}$/i.test(token)) {
          res.status(200).json(
            ok(id, {
              content: [
                {
                  type: 'text',
                  text: 'Not connected. Add your Pond Hopping token — find it in the app under Account — as ?key=<token> on the server URL, or as an Authorization: Bearer header.',
                },
              ],
              isError: true,
            })
          )
          return
        }

        const out = await callTool(token, msg.params?.name, msg.params?.arguments || {})

        // The SQL functions return null for an unresolvable token rather
        // than erroring, so translate that into something the model can act on.
        if (out === null) {
          res.status(200).json(
            ok(id, {
              content: [{ type: 'text', text: 'That token is not valid. Check it in the app under Account.' }],
              isError: true,
            })
          )
          return
        }

        res.status(200).json(
          ok(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] })
        )
        return
      }

      case 'ping':
        res.status(200).json(ok(id, {}))
        return

      default:
        res.status(200).json(fail(id, -32601, `Method not found: ${msg.method}`))
    }
  } catch (err) {
    console.error(err)
    res.status(200).json(fail(id, -32603, err.message))
  }
}
