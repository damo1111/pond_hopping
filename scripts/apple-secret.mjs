// The Apple client secret, which is not a secret you are given.
//
// Every other provider hands you a string to paste. Apple hands you a
// private key and expects a JWT signed with it, valid for at most six
// months, and Supabase wants that JWT in the box labelled "secret". That
// mismatch is most of why setting Apple up feels harder than it is.
//
// Run it where the .p8 is — your machine, not a server and not a chat:
//
//   node scripts/apple-secret.mjs \
//     --p8 ~/Downloads/AuthKey_ABC123XYZ.p8 \
//     --team  1A2B3C4D5E \
//     --key   ABC123XYZ \
//     --services app.eend.pond.web
//
// It prints one line: the JWT. Paste that into Supabase → Authentication →
// Sign In / Providers → Apple → Secret Key. The .p8 itself never leaves the
// machine and is never printed — Apple issues it once and will not reissue
// it, so this reads it and says nothing about it.
//
// Diary note: it expires. Apple's ceiling is six months and this uses it, so
// whatever date this is run, sign-in with Apple stops working six months
// later unless it is run again. There is no way to make it permanent.

import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

const SIX_MONTHS = 15777000 // Apple's documented maximum, in seconds.

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : null
}

const p8 = arg('p8')
const team = arg('team')
const key = arg('key')
const services = arg('services')

if (!p8 || !team || !key || !services) {
  console.error(
    'Need all four:\n' +
      '  --p8       path to AuthKey_XXXXXXXXXX.p8\n' +
      '  --team     Team ID, top right of the developer portal\n' +
      '  --key      Key ID, the XXXXXXXXXX in the filename\n' +
      '  --services the Services ID, not the App ID'
  )
  process.exit(1)
}

const b64 = (o) =>
  Buffer.from(typeof o === 'string' ? o : JSON.stringify(o))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

let pem
try {
  pem = readFileSync(p8, 'utf8')
} catch (e) {
  console.error(`Could not read the key at ${p8} — ${e.code ?? e.message}`)
  process.exit(1)
}

// Said plainly rather than left to a confusing signing error further down.
if (!pem.includes('BEGIN PRIVATE KEY')) {
  console.error(`${p8} does not look like a .p8 private key.`)
  process.exit(1)
}

const now = Math.floor(Date.now() / 1000)
const header = b64({ alg: 'ES256', kid: key })
const claims = b64({
  iss: team,
  iat: now,
  exp: now + SIX_MONTHS,
  aud: 'https://appleid.apple.com',
  // The Services ID, and the reason this script asks for it separately: the
  // App ID here is the single most common cause of `invalid_client`.
  sub: services,
})

const signer = createSign('SHA256')
signer.update(`${header}.${claims}`)
// ES256 means the JWS-flavoured fixed-width signature, not the DER one
// node produces by default. Without this Apple returns `invalid_client`
// and says nothing about why.
const sig = signer
  .sign({ key: pem, dsaEncoding: 'ieee-p1363' })
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '')

console.log(`${header}.${claims}.${sig}`)
console.error(`\nExpires ${new Date((now + SIX_MONTHS) * 1000).toISOString().slice(0, 10)}. Diarise it.`)
