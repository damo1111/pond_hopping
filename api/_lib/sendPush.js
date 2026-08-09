// Sends a push to every device belonging to one person, by whichever road
// that device's platform requires.
//
// Android goes through FCM's HTTP v1 API, which needs an OAuth access token
// minted from the Firebase service account — the same JSON already generated
// for App Distribution. The legacy server-key endpoint is retired, so there's
// no simpler path. Signing the JWT by hand with node:crypto avoids pulling in
// googleapis (tens of megabytes) for one token request.
//
// iOS goes straight to Apple (see sendApns.js). Capacitor's push plugin hands
// back an APNs token on iOS, and FCM will not accept one of those — routing it
// through FCM instead would have meant adding the Firebase SDK to the Xcode
// project, which is native work that cannot be compiled or tested from here.
//
// Every failure here is swallowed by the caller: a missed notification must
// never cost someone their booking import.
import { createSign } from 'node:crypto'
import { sendApns } from './sendApns.js'

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claim}`)
  const sig = signer.sign(sa.private_key, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  })
  if (!res.ok) throw new Error(`google token ${res.status}: ${await res.text()}`)
  return (await res.json()).access_token
}

export async function sendPush({ email, title, body, data = {} }) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  const pushSecret = process.env.PUSH_SECRET
  if (!pushSecret) return { sent: 0, skipped: 'not configured' }

  const devRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/push_devices_for`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_email: email, p_secret: pushSecret }),
  })
  if (!devRes.ok) throw new Error(`push_devices_for ${devRes.status}`)
  const devices = await devRes.json()
  if (!devices?.length) return { sent: 0, skipped: 'no devices' }

  const apple = devices.filter((d) => d.platform === 'ios')
  const google = devices.filter((d) => d.platform !== 'ios')

  let sent = 0
  const dead = []

  for (const d of apple) {
    const res = await sendApns({ token: d.token, title, body, data })
    if (res.ok) sent++
    else if (res.dead) dead.push(d.token)
    else if (res.reason) console.error('apns', res.status, res.reason)
  }

  // Minted only if there is somewhere to send it — an all-iPhone household
  // shouldn't need a Firebase key present at all.
  const sa = google.length && raw ? JSON.parse(raw) : null
  const bearer = sa ? await accessToken(sa) : null

  for (const d of google) {
    if (!bearer) break
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: d.token,
          notification: { title, body },
          // Values must be strings — FCM rejects the whole message otherwise.
          data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        },
      }),
    })
    if (res.ok) sent++
    // 404/UNREGISTERED means the app was uninstalled or the token rotated;
    // keeping it would mean retrying a dead device forever.
    else if (res.status === 404 || res.status === 400) dead.push(d.token)
  }

  if (dead.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?token=in.(${dead.map((t) => `"${t}"`).join(',')})`, {
      method: 'DELETE',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, Prefer: 'return=minimal' },
    }).catch(() => {})
  }

  return { sent, pruned: dead.length }
}
