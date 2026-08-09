// Sends the email an invited person actually receives.
//
// Until now "Send invite" wrote a `connections` row and stopped — the app
// has never had a mailer, so the person on the other end was never told and
// found out by signing in with that address one day and noticing. The
// screen was honest about it ("nothing is emailed from here") and handed
// you a sentence to send yourself, which is better than lying but is still
// homework.
//
// Resend rather than SMTP: Supabase's mail settings only cover its own auth
// emails and can't be borrowed for this, and relaying through the Workspace
// mailbox means Gmail's From-rewriting, a daily cap and no bounce handling —
// all of which bit us on the sign-in codes. Resend's DNS records live on a
// subdomain, so they don't touch the MX that Workspace owns on eend.app.
//
// Two guards, because an endpoint that sends mail from your own domain is a
// spam relay if anyone can call it:
//
//   1. The caller must present a valid Supabase session token.
//   2. The recipient must already be on that caller's own connections list.
//      So this can only ever email somebody you have genuinely invited from
//      inside the app — never an address of the caller's choosing.
const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

const FROM = 'Pond Hopping <hello@eend.app>'
const APP_URL = 'https://pond.eend.app'

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

// Same furniture as the sign-in email, so the two read as one app rather
// than two systems that happen to share a name.
function html({ inviter, invitee }) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1A1611;text-align:center;padding:24px;background:#F5F2EB">
  <img src="${APP_URL}/duck.png" width="56" height="56" alt="Pond Hopping" style="border-radius:14px">
  <h2 style="margin:14px 0 4px;font-size:20px">
    <span style="font-weight:300;color:#1A1611;letter-spacing:0.06em">Pond</span>
    <span style="font-weight:700;color:#A8842C">Hopping</span>
  </h2>
  <p style="margin:0 0 14px;color:#8B8375">${esc(inviter)} has added you to their travel log.</p>
  <p style="margin:0 auto 18px;color:#8B8375;max-width:380px;line-height:1.5">Pond Hopping keeps the trips you've taken — the flights, the places, the photos — and plans the next one. You'll see whatever they've chosen to share with you.</p>
  <a href="${APP_URL}" style="display:inline-block;background:#1A1611;color:#F5F2EB;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:600">Open Pond Hopping</a>
  <p style="color:#8B8375;font-size:13px;margin-top:18px">Sign in with <b>${esc(invitee)}</b> — the address this was sent to. We email you a code; there's no password to make up.</p>
  <p style="color:#B3AA99;font-size:12px;margin-top:18px">Not expecting this? Ignore it and nothing happens — no account is created until you sign in.</p>
</div>`
}

function text({ inviter, invitee }) {
  return [
    `${inviter} has added you to their travel log on Pond Hopping.`,
    '',
    `Pond Hopping keeps the trips you've taken — the flights, the places, the photos — and plans the next one. You'll see whatever they've chosen to share with you.`,
    '',
    `Open ${APP_URL} and sign in with ${invitee}, the address this was sent to. We email you a code; there's no password to make up.`,
    '',
    `Not expecting this? Ignore it and nothing happens — no account is created until you sign in.`,
  ].join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }

  const key = process.env.RESEND_API_KEY
  if (!key) {
    // Deliberately explicit: the client falls back to the share sheet on a
    // failure, and "not configured" is the one failure worth naming.
    res.status(503).json({ error: 'not configured' })
    return
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) {
    res.status(401).json({ error: 'sign in first' })
    return
  }

  const invitee = String(req.body?.email || '').trim().toLowerCase()
  if (!invitee) {
    res.status(400).json({ error: 'email required' })
    return
  }

  try {
    // 1 — who is calling?
    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    })
    if (!meRes.ok) {
      res.status(401).json({ error: 'sign in first' })
      return
    }
    const me = await meRes.json()

    // 2 — is this somebody they actually invited? Asked with the caller's own
    // token, so RLS answers for their rows and nobody else's.
    const rowsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/connections?select=invitee_email&user_id=eq.${me.id}&invitee_email=eq.${encodeURIComponent(invitee)}`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } }
    )
    const rows = rowsRes.ok ? await rowsRes.json() : []
    if (!rows.length) {
      res.status(403).json({ error: 'not on your list' })
      return
    }

    // The inviter's own name if they've set one — never the raw local part
    // of their address, which is the guess this app has just stopped making.
    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=display_name&id=eq.${me.id}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    })
    const prof = profRes.ok ? (await profRes.json())[0] : null
    const inviter = prof?.display_name || me.email

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [invitee],
        reply_to: me.email,
        subject: `${inviter} added you to Pond Hopping`,
        html: html({ inviter, invitee }),
        text: text({ inviter, invitee }),
      }),
    })

    if (!sendRes.ok) {
      const detail = await sendRes.text()
      console.error('resend', sendRes.status, detail)
      res.status(502).json({ error: 'send failed' })
      return
    }

    res.status(200).json({ ok: true, sent: invitee })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
