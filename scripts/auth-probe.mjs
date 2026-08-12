// Which endpoints actually check who is calling.
//
//   node scripts/auth-probe.mjs https://pond.eend.app
//   node scripts/auth-probe.mjs https://pond.eend.app "$REAL_TOKEN"
//
// Ten endpoints guard themselves with
//
//     if (!(req.headers.authorization || '').startsWith('Bearer ')) → 401
//
// which tests that the header begins with seven particular characters and
// nothing else. `Bearer x` passes. There is no signature check, no expiry
// check, and no question of whose token it is.
//
// ── What that does and does not cost ──────────────────────────────────
//
// It does **not** leak data. `api/_lib/rest.js` sends the caller's token
// on to PostgREST and there is no service key anywhere in the functions,
// so row-level security still decides everything: a made-up token reaches
// Postgres, Postgres refuses it, and the endpoint fails. `build-story.js`
// is the whole of that category and it is genuinely safe.
//
// It **does** cost money. Seven endpoints take what they need out of the
// request body and call a paid service before they ever touch the
// database, so there is no policy anywhere in the path:
//
//   see-photos          OpenAI vision, on image URLs from the body — the
//                       expensive one, and the easiest to point elsewhere
//   reconstruct-trip    OpenAI
//   write-trip          OpenAI
//   write-day           OpenAI
//   which-place         OpenAI
//   enrich-flight       AeroDataBox
//   enrich-flight-cirium Cirium
//
// ── How this probes without spending anything ─────────────────────────
//
// Every one of them validates its body *after* the auth check. So the
// answer to a deliberately empty body separates the two cases at no cost:
//
//   401  the gate held — nothing got through
//   400  the gate let us in and validation caught it — a real token would
//        have reached the paid call
//   5xx  it got further than it should have; worth reading
//
// Nothing here sends a payload that could reach a model. Run it against
// production as often as you like.

const base = (process.argv[2] || 'https://pond.eend.app').replace(/\/$/, '')
const real = process.argv[3] || null

/** Empty bodies on purpose — see above. */
const ENDPOINTS = [
  { path: '/api/see-photos', spends: 'OpenAI vision' },
  { path: '/api/reconstruct-trip', spends: 'OpenAI' },
  { path: '/api/write-trip', spends: 'OpenAI' },
  { path: '/api/write-day', spends: 'OpenAI' },
  { path: '/api/which-place', spends: 'OpenAI' },
  { path: '/api/name-places', spends: '—' },
  { path: '/api/enrich-flight', spends: 'AeroDataBox' },
  { path: '/api/enrich-flight-cirium', spends: 'Cirium' },
  { path: '/api/build-story', spends: '— (row-level security applies)' },
  { path: '/api/mcp', spends: '—' },
]

async function ask(path, auth) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) headers.Authorization = auth
  try {
    const r = await fetch(`${base}${path}`, { method: 'POST', headers, body: '{}' })
    const said = (await r.text()).slice(0, 120).replace(/\s+/g, ' ')
    return { status: r.status, said }
  } catch (e) {
    return { status: 0, said: e.message }
  }
}

const pad = (s, n) => String(s).padEnd(n)

/**
 * Am I actually talking to the app?
 *
 * Written after the first run of this reported "10 of 10 let Bearer x
 * through" from a sandbox whose egress proxy answers everything with 403.
 * Every number was identical and every one of them was the proxy. A check
 * that cannot tell "the endpoint is open" from "I never reached the
 * endpoint" reports a breach that is not there, and would just as happily
 * report all-clear when it is.
 */
async function reachable() {
  try {
    const r = await fetch(base, { method: 'GET' })
    const body = await r.text()
    if (!r.ok) return `${base} answered ${r.status} to a plain GET`
    if (!/<div id="root"|Pond Hopping/i.test(body)) return `${base} answered, but not with the app`
    return null
  } catch (e) {
    return `could not reach ${base} — ${e.message}`
  }
}

const why = await reachable()
if (why) {
  console.error(`\nNot probing: ${why}.`)
  console.error('Every endpoint would return the same thing and it would not be the app.\n')
  process.exit(2)
}

console.log(`\nProbing ${base}\n`)
console.log(pad('endpoint', 28), pad('no auth', 9), pad('Bearer x', 9), real ? 'real token' : '')
console.log('─'.repeat(real ? 68 : 50))

let leaky = 0
for (const e of ENDPOINTS) {
  const none = await ask(e.path, null)
  const fake = await ask(e.path, 'Bearer x')
  const good = real ? await ask(e.path, `Bearer ${real}`) : null

  // 401 to a made-up token is the endpoint doing its job. Anything else
  // means the gate is a string comparison.
  const held = fake.status === 401
  if (!held) leaky++
  console.log(
    pad(e.path.replace('/api/', ''), 28),
    pad(none.status, 9),
    pad(`${fake.status}${held ? ' ✓' : ' ✗'}`, 9),
    good ? good.status : ''
  )
  if (!held && e.spends !== '—') console.log(pad('', 28), `↳ would reach ${e.spends}`)
}

console.log(`\n${leaky} of ${ENDPOINTS.length} let "Bearer x" through.\n`)
console.log('401 everywhere is the target. Until then the exposure is spend,')
console.log('not data — row-level security still refuses a made-up token at')
console.log('the database, and there is no service key in any function.\n')

// Non-zero so this can gate a deploy once the endpoints are fixed.
process.exit(leaky ? 1 : 0)
