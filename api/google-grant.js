// The wall the Google refresh token sits behind.
//
// POST  — "here is a refresh token that just arrived, keep it"
// GET   — "give me an access token", answered from the kept one
//
// The refresh token goes in and never comes out. The browser gets an hour's
// access token and nothing else, which is the entire reason this endpoint
// exists rather than the page holding the refresh token itself.
//
// ── Whose token ──────────────────────────────────────────────────────────
//
// Every call carries the caller's Supabase access token and the row is keyed
// on the user id *Supabase* reports for it — never on an id the caller sends.
// A body-supplied user id is a request to read somebody else's photographs.
//
// ── Two keys, two jobs ───────────────────────────────────────────────────
//
// SUPABASE_SERVICE_ROLE_KEY bypasses RLS, and google_grants has RLS on with
// no policies, so the service key is the only thing that can touch it. It is
// used for exactly two statements below and never handed anything a caller
// wrote without checking it first.
//
// GOOGLE_OAUTH_CLIENT_ID / _SECRET are the credentials of the same Google
// Cloud OAuth client Supabase Auth is configured with — a refresh token can
// only be exchanged by the client it was issued to. Absent, this endpoint
// says so and the app falls back to the round trip it does today, which is
// worse but works.

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET

/** Who the caller actually is, according to Supabase rather than to them. */
async function whoIsAsking(req) {
  const said = String(req.headers.authorization || '')
  const token = said.startsWith('Bearer ') ? said.slice(7) : null
  if (!token) return null
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return null
  const user = await r.json()
  return user?.id ? { id: user.id } : null
}

/** The grants table, with the only key that can reach it. */
function grants() {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
  return {
    async put(row) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/google_grants?on_conflict=user_id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(row),
      })
      if (!r.ok) throw new Error(`store — ${r.status} ${(await r.text()).slice(0, 160)}`)
    },
    async get(userId) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/google_grants?user_id=eq.${userId}&select=refresh_token,broke_at`,
        { headers }
      )
      if (!r.ok) throw new Error(`read — ${r.status}`)
      const rows = await r.json()
      return Array.isArray(rows) ? rows[0] ?? null : null
    },
    async broke(userId, why) {
      await fetch(`${SUPABASE_URL}/rest/v1/google_grants?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ broke_at: new Date().toISOString(), broke_why: String(why).slice(0, 200) }),
      })
    },
    async worked(userId) {
      await fetch(`${SUPABASE_URL}/rest/v1/google_grants?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ refreshed_at: new Date().toISOString(), broke_at: null, broke_why: null }),
      })
    },
  }
}

export default async function handler(req, res) {
  if (!SERVICE_KEY) {
    res.status(500).json({ error: 'not configured', why: 'SUPABASE_SERVICE_ROLE_KEY' })
    return
  }

  const who = await whoIsAsking(req)
  if (!who) {
    res.status(401).json({ error: 'sign in first' })
    return
  }

  const db = grants()

  if (req.method === 'POST') {
    const refresh = req.body?.refresh_token
    // Guarded rather than trusted. An empty write here would replace a
    // working grant with nothing, which is the exact failure this endpoint
    // exists to prevent, and onAuthStateChange fires with empty sessions
    // often enough that it would happen within the hour.
    if (typeof refresh !== 'string' || refresh.length < 10) {
      res.status(400).json({ error: 'no refresh token in that' })
      return
    }
    try {
      await db.put({
        user_id: who.id,
        refresh_token: refresh,
        scopes: typeof req.body?.scopes === 'string' ? req.body.scopes.slice(0, 500) : null,
        granted_at: new Date().toISOString(),
        broke_at: null,
        broke_why: null,
      })
      // Deliberately says nothing about the token it was given.
      res.status(200).json({ kept: true })
    } catch (e) {
      res.status(500).json({ error: 'could not keep it', why: e.message })
    }
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'POST to keep one, GET to use one' })
    return
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    // Said plainly, because the symptom otherwise is "connecting still asks
    // every time" with nothing anywhere explaining why.
    res.status(501).json({ error: 'not configured', why: 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET' })
    return
  }

  let row
  try {
    row = await db.get(who.id)
  } catch (e) {
    res.status(500).json({ error: 'could not read the grant', why: e.message })
    return
  }
  if (!row?.refresh_token) {
    // Not an error. Somebody who has never connected Google Photos is the
    // ordinary case, and the app's answer to it is the consent screen.
    res.status(404).json({ error: 'not connected' })
    return
  }

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const said = await r.json().catch(() => ({}))

  if (!r.ok) {
    // invalid_grant means somebody revoked us in their Google account, or the
    // token went six months unused. That is a thing to tell them, and it is
    // different from Google having a bad minute — which must not send anybody
    // back to a consent screen they do not need.
    if (said?.error === 'invalid_grant') {
      await db.broke(who.id, said.error_description || said.error)
      res.status(403).json({ error: 'invalid_grant' })
      return
    }
    res.status(502).json({ error: 'google would not swap it', why: said?.error || r.status })
    return
  }

  await db.worked(who.id)
  // The access token and how long it is good for. Never the refresh token.
  res.status(200).json({
    access_token: said.access_token,
    expires_in: said.expires_in ?? null,
    scope: said.scope ?? null,
  })
}
