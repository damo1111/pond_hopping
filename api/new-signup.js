// Somebody new made an account.
//
// Called by a trigger on auth.users — see the migration
// `tell_the_owner_when_somebody_new_arrives`. Nothing in the app calls this,
// and nothing should: a signup happens to somebody else, on a device that is
// not yours, so the only place that knows about it is the database.
//
// The trigger holds the shared secret already: app_config carries
// `push_secret`, which is the same value Vercel has as PUSH_SECRET and the
// same one push_devices_for() checks. No new credential, nothing to paste
// anywhere, and one place to rotate.
//
// Failing here is quiet on purpose. A missed notification must never be
// allowed to cost somebody their account, and the trigger cannot see this
// answer anyway.
import { sendPush } from './_lib/sendPush.js'

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

async function adminEmails(secret) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_emails_for`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_secret: secret }),
  })
  if (!r.ok) throw new Error(`admin_emails_for ${r.status}`)
  const rows = await r.json()
  return (Array.isArray(rows) ? rows : []).map((e) => String(e?.email ?? e)).filter(Boolean)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  const secret = process.env.PUSH_SECRET
  const given = req.query?.key || ''
  // A wrong key gets the same answer as a right one with nothing to do, so
  // this endpoint cannot be used to find out whether it is configured.
  if (!secret || given !== secret) {
    res.status(200).json({ ok: true })
    return
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const whenRaw = req.body?.at ? new Date(req.body.at) : null
  const when = whenRaw && !Number.isNaN(whenRaw.valueOf()) ? whenRaw : null

  try {
    const admins = await adminEmails(secret)
    // Nobody wants telling that they themselves have signed up.
    const tell = admins.filter((a) => a.toLowerCase() !== email)
    let sent = 0
    for (const to of tell) {
      const r = await sendPush({
        email: to,
        title: 'Somebody new joined Pond Hopping',
        body: email || 'a new account',
        data: { kind: 'new_signup', email, at: when ? when.toISOString() : null },
      }).catch((e) => ({ error: String(e) }))
      sent += r?.sent ?? 0
    }
    res.status(200).json({ ok: true, told: tell.length, sent })
  } catch (e) {
    console.error(`new-signup: ${e.message}`)
    res.status(200).json({ ok: true, failed: e.message })
  }
}
