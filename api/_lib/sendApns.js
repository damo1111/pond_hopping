// Push to an iPhone, straight to Apple.
//
// Android goes through FCM, which is where the Firebase service account and
// all the existing machinery lives. iOS could have gone the same way, but
// only by adding the Firebase SDK to the Xcode project so the device
// registers an FCM token rather than the APNs one Capacitor's push plugin
// already hands back — native work that cannot be compiled or tested from
// here, verified only by pushing builds at Xcode Cloud and reading the
// failures. Talking to Apple directly moves that risk into server code
// instead, and the client side shrinks to an entitlement, a background mode
// and two delegate methods.
//
// APNs is HTTP/2 only, so this uses node:http2 rather than fetch — undici
// does not speak it. Authentication is a short ES256 JWT signed with the
// .p8 key, which is the same shape as the RS256 one sendPush already signs
// by hand for Google's OAuth.
import { createSign } from 'node:crypto'
import http2 from 'node:http2'

const PROD = 'https://api.push.apple.com'
const SANDBOX = 'https://api.sandbox.push.apple.com'

// The bundle identifier, which is what APNs calls the topic. iOS keeps
// app.eend.pond; only the Android package moved to pond.eend.app for Play.
const TOPIC = 'app.eend.pond'

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Apple asks that a token be reused rather than minted per push, and refuses
// tokens older than an hour. One per lambda instance, refreshed well inside
// the window, is the middle of that.
let cached = null

function providerToken({ key, keyId, teamId }) {
  const now = Math.floor(Date.now() / 1000)
  if (cached && now - cached.iat < 45 * 60) return cached.jwt

  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }))
  const claim = b64url(JSON.stringify({ iss: teamId, iat: now }))
  const signer = createSign('SHA256')
  signer.update(`${header}.${claim}`)
  // APNs wants the raw r||s pair, not the DER wrapper OpenSSL produces.
  const sig = signer.sign({ key, dsaEncoding: 'ieee-p1363' })
  const jwt = `${header}.${claim}.${sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`

  cached = { jwt, iat: now }
  return jwt
}

function post(host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(host)
    client.on('error', reject)
    const req = client.request({ ':method': 'POST', ':path': path, ...headers })
    let status = 0
    let text = ''
    req.on('response', (h) => {
      status = h[':status']
    })
    req.setEncoding('utf8')
    req.on('data', (c) => {
      text += c
    })
    req.on('error', (e) => {
      client.close()
      reject(e)
    })
    req.on('end', () => {
      client.close()
      resolve({ status, text })
    })
    req.end(body)
  })
}

/**
 * One notification to one device.
 *
 * @returns {Promise<{ ok: boolean, dead?: boolean, status?: number, reason?: string }>}
 *   `dead` means Apple has told us this token will never work again, which is
 *   the caller's cue to delete it rather than retry it forever.
 */
export async function sendApns({ token, title, body, data = {} }) {
  const key = process.env.APNS_KEY_P8
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  if (!key || !keyId || !teamId) return { ok: false, reason: 'not configured' }

  const jwt = providerToken({ key, keyId, teamId })
  const payload = JSON.stringify({
    aps: { alert: { title, body }, sound: 'default' },
    ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
  })
  const headers = {
    authorization: `bearer ${jwt}`,
    'apns-topic': TOPIC,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'content-type': 'application/json',
  }

  // TestFlight and App Store builds are production; a build run from Xcode is
  // sandbox, and the two environments issue tokens the other rejects. Rather
  // than track which build a device came from, try production and let Apple's
  // own error tell us to go the other way.
  let res = await post(PROD, `/3/device/${token}`, headers, payload)
  let reason = ''
  if (res.status !== 200) {
    try {
      reason = JSON.parse(res.text || '{}').reason || ''
    } catch {
      reason = res.text || ''
    }
    if (reason === 'BadDeviceToken' || reason === 'BadEnvironmentKeyInToken') {
      res = await post(SANDBOX, `/3/device/${token}`, headers, payload)
      if (res.status === 200) return { ok: true }
      try {
        reason = JSON.parse(res.text || '{}').reason || reason
      } catch {
        /* keep the production reason */
      }
    }
  }

  if (res.status === 200) return { ok: true }

  // 410 Unregistered is the app being deleted. BadDeviceToken surviving both
  // environments is a token that was never valid. Neither is worth keeping.
  const dead = res.status === 410 || reason === 'Unregistered' || reason === 'BadDeviceToken'
  return { ok: false, dead, status: res.status, reason }
}
