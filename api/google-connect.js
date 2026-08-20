import { opened, sealed } from '../src/lib/connectState.js'
import { PHOTOS_SCOPE } from '../src/lib/googlePhotos.js'

// Connecting Google Photos, without Supabase in the middle.
//
// ── Why this exists ──────────────────────────────────────────────────────
//
// google_grants sat empty for a week. The refresh token was supposed to
// arrive on the session Supabase hands back after the OAuth round trip, be
// noticed by a listener, and be POSTed to api/google-grant. Every part of
// that is real and deployed, and not one grant was ever stored.
//
// The reason it could not be diagnosed is the reason this exists. That path
// depends on Supabase surfacing `provider_refresh_token` in one particular
// instant, on our listener being mounted in that instant, and on the tab
// that receives the redirect being the tab that is listening. Three things
// that must all be true, none of which is visible when one is not.
//
// This has none of them. We ask Google ourselves, Google answers to our own
// endpoint, and we exchange the code here with our own client secret. The
// refresh token goes straight into the table from this function and never
// touches the browser at all.
//
// ── The three shapes of request ──────────────────────────────────────────
//
//   POST                     "I am signed in, where do I send them?" — the
//                            app's own token is checked here, and the answer
//                            carries a sealed state naming the person.
//   GET  ?code=&state=       Google, coming back. Nobody is signed in on
//                            this request and there is no header to read, so
//                            `state` is the only thing that says who it is
//                            for — which is exactly why it is signed.
//   GET  (anything else)     Nothing to say.

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET
// The state signing key. Reuses the secret the workers already hold rather
// than inventing a variable somebody has to remember to set — one more
// unset variable is how this feature failed the first time.
const STATE_KEY = process.env.PUSH_SECRET

/**
 * This deployment's own address, not a hardcoded one.
 *
 * It was fixed at pond.eend.app, so a preview build sent Google a
 * redirect_uri pointing at production: consent on the preview would land
 * somebody on a different site, which reads as the app having reloaded
 * itself for no reason.
 *
 * Note that a preview still cannot complete the round trip — Google only
 * accepts redirect URIs registered against the OAuth client, and preview
 * URLs change with every deploy. This makes the behaviour correct and
 * legible rather than silently wrong; OAuth is tested on production.
 */
const homeOf = (req) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return host ? `https://${host}` : 'https://pond.eend.app'
}

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

/** Straight into the table, with the only key that can reach it. */
async function keep(userId, refresh, scope) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/google_grants?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: userId,
      refresh_token: refresh,
      scopes: typeof scope === 'string' ? scope.slice(0, 500) : null,
      granted_at: new Date().toISOString(),
      broke_at: null,
      broke_why: null,
    }),
  })
  if (!r.ok) throw new Error(`store — ${r.status} ${(await r.text()).slice(0, 160)}`)
}

/**
 * Back into the app, with a word about how it went.
 *
 * Always a redirect, never a page. Somebody who has just approved a consent
 * screen must land in the app, and the one thing worse than failing is
 * failing on a white page in a browser tab with no way back — which is
 * where Google's own "Done!" screen already leaves people once.
 */
const backToApp = (req, res, how) => {
  res.writeHead(302, { Location: `${homeOf(req)}/?google=${encodeURIComponent(how)}` })
  res.end()
}

export default async function handler(req, res) {
  if (!SERVICE_KEY || !STATE_KEY) {
    res.status(500).json({ error: 'not configured', why: 'SUPABASE_SERVICE_ROLE_KEY / PUSH_SECRET' })
    return
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    // Said plainly and early, because the symptom otherwise is "connecting
    // still asks every time" with nothing anywhere explaining why — which is
    // precisely how the last month went.
    res.status(501).json({ error: 'not configured', why: 'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET' })
    return
  }

  // ── Google, coming back ────────────────────────────────────────────────
  if (req.method === 'GET' && (req.query?.code || req.query?.state || req.query?.error)) {
    if (req.query.error) {
      // They said no, or Google did. Not an error to shout about — a
      // decision, and the app's answer to it is to carry on without.
      backToApp(req, res, 'declined')
      return
    }
    const who = opened(req.query.state, STATE_KEY)
    if (!who) {
      // Edited, expired, or signed with something else. One answer for all
      // of them, and nothing is written.
      backToApp(req, res, 'expired')
      return
    }

    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: String(req.query.code),
        grant_type: 'authorization_code',
        redirect_uri: `${homeOf(req)}/api/google-connect`,
      }),
    })
    const said = await r.json().catch(() => ({}))
    if (!r.ok || !said.refresh_token) {
      // No refresh token in an authorization_code exchange means the consent
      // was not asked for offline, or Google had already granted one to this
      // client and did not re-issue. prompt=consent below is what forces the
      // second case to hand one over anyway.
      backToApp(req, res, said.refresh_token ? 'refused' : 'no-refresh-token')
      return
    }

    try {
      await keep(who.uid, said.refresh_token, said.scope)
    } catch {
      backToApp(req, res, 'not-stored')
      return
    }
    backToApp(req, res, 'connected')
    return
  }

  // ── The app, asking where to send somebody ─────────────────────────────
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST to start, GET is Google coming back' })
    return
  }

  const asking = await whoIsAsking(req)
  if (!asking) {
    res.status(401).json({ error: 'sign in first' })
    return
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', `${homeOf(req)}/api/google-connect`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', PHOTOS_SCOPE)
  // Offline and consent together are the whole point: offline asks for a
  // refresh token, and consent forces one to be re-issued for somebody who
  // has approved this client before. Without the second, a returning person
  // gets an access token and nothing durable — which is a fair description
  // of every attempt so far.
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('state', sealed({ uid: asking.id }, STATE_KEY))

  res.status(200).json({ url: url.toString() })
}
