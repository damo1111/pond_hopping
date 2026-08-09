// Sends the email an invited person actually receives.
//
// Until now "Send invite" wrote a `connections` row and stopped — the app
// has never had a mailer, so the person on the other end was never told and
// found out by signing in with that address one day and noticing. The
// screen was honest about it ("nothing is emailed from here") and handed
// you a sentence to send yourself, which is better than lying but is still
// homework.
//
// Sent through CloudMailin, which is already receiving on this domain for
// bookings@eend.app and already paid for. Resend was the first choice and
// would have been cleaner, but its free tier allows one verified domain and
// that slot is spoken for by another project — so it would have meant $20 a
// month for a handful of invites. The Workspace mailbox was the other
// candidate and is the worse one: Gmail rewrites the From unless the address
// is a verified send-as, caps the day, and reports nothing back when an
// address bounces. Keeping app mail off the mailbox that sends the sign-in
// codes also means one bad address can't damage the reputation of the other.
//
// SMTP rather than an HTTP API because that is what CloudMailin's outbound
// offers; nodemailer is the only dependency it costs.
//
// Two guards, because an endpoint that sends mail from your own domain is a
// spam relay if anyone can call it:
//
//   1. The caller must present a valid Supabase session token.
//   2. The recipient must already be on that caller's own connections list.
//      So this can only ever email somebody you have genuinely invited from
//      inside the app — never an address of the caller's choosing.
import nodemailer from 'nodemailer'

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

  // cloudmta.net, not cloudmailin.com — the outbound service runs on its own
  // hostname, and the one that matches the brand name is the wrong one. It is
  // printed against the account in the CloudMailin dashboard; the override is
  // here in case that ever changes under us.
  const host = process.env.CLOUDMAILIN_SMTP_HOST || 'smtp.cloudmta.net'
  const user = process.env.CLOUDMAILIN_SMTP_USER
  const pass = process.env.CLOUDMAILIN_SMTP_PASS
  if (!user || !pass) {
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

    // 587 with STARTTLS rather than 465: a serverless function gets a fresh
    // connection every time, and the implicit-TLS port is slower to open for
    // no benefit once STARTTLS is required anyway.
    const mailer = nodemailer.createTransport({
      host,
      port: Number(process.env.CLOUDMAILIN_SMTP_PORT || 587),
      secure: false,
      requireTLS: true,
      auth: { user, pass },
    })

    // Reply-To is the inviter, not the app: the first thing anybody does with
    // an unexpected invitation is reply to it, and that should reach the
    // person who sent it rather than a mailbox nobody reads.
    await mailer.sendMail({
      from: FROM,
      to: invitee,
      replyTo: me.email,
      subject: `${inviter} added you to Pond Hopping`,
      html: html({ inviter, invitee }),
      text: text({ inviter, invitee }),
    })

    res.status(200).json({ ok: true, sent: invitee })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
