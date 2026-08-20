import { test } from 'node:test'
import assert from 'node:assert/strict'
import { onlyTheNewOnes, sendThemIn, pickFromGoogle, rememberSession, tokenFromGrant } from './photoImport.js'

// The whole import, from tap to queued, with every outside thing faked.
//
// Written because four separate bugs shipped in this path and every one of
// them was invisible: a missing /api/ prefix, a Response read as JSON, a
// missing Authorization header, and a Response read as JSON again. None
// threw. Each produced null or a fallback, and the app answered by opening a
// consent screen — so all four looked identical from the outside, and looked
// like Google's fault.
//
// The fakes are at the network boundary rather than at our own helpers, so
// the things asserted are the things that were wrong: which URL is called,
// what header goes with it, and what is done with what comes back.

const GOOGLE_TOKEN = 'ya29.a-token-with-the-photos-scope'
const SESSION_ID = 'sessions/abc123'

/** A fake of our own API, recording every request it is given. */
function ourApi() {
  const seen = []
  return {
    seen,
    call: async (path, options = {}) => {
      seen.push({ path, method: options.method ?? 'GET', auth: !!options.auth })
      if (path === '/api/google-grant' && (options.method ?? 'GET') === 'GET') {
        return { ok: true, status: 200, url: `https://pond.eend.app${path}`, json: async () => ({ access_token: GOOGLE_TOKEN, expires_in: 3599 }) }
      }
      return { ok: true, status: 200, url: `https://pond.eend.app${path}`, json: async () => ({}) }
    },
  }
}

test('the grant is read from our own API, with the caller identified', async () => {
  // Three of the four bugs lived in this one call: the path, the header, and
  // reading the Response instead of the body.
  const api = ourApi()
  const token = await tokenFromGrant({ ask: api.call })
  assert.equal(token, GOOGLE_TOKEN)
  assert.deepEqual(api.seen, [{ path: '/api/google-grant', method: 'GET', auth: true }])
})

test('a pick runs from token to picked list without touching a browser', async () => {
  const steps = []
  const written = []
  const out = await pickFromGoogle({
    onStep: (s) => steps.push(s),
    onPicker: () => {},
    intoTrip: 'trip-1',
    // Google says the token carries the Photos scope.
    facts: async () => ({ scopes: ['https://www.googleapis.com/auth/photospicker.mediaitems.readonly'] }),
    tokens: async () => [GOOGLE_TOKEN],
    open: async () => ({ id: SESSION_ID, pickerUri: 'https://photospicker.google.com/x' }),
    remember: async (trip, session, token) => { written.push({ trip, session, token }); return true },
    show: async () => false,
    hide: async () => {},
    rest: async () => {},
    poll: async () => ({ mediaItemsSet: true }),
    list: async () => [
      { id: 'g1', mediaFile: { baseUrl: 'https://lh3/x1', mimeType: 'image/jpeg' }, createTime: '2026-05-21T10:00:00Z' },
      { id: 'g2', mediaFile: { baseUrl: 'https://lh3/x2', mimeType: 'image/jpeg' }, createTime: '2026-05-21T11:00:00Z' },
    ],
  })
  assert.equal(out.key, GOOGLE_TOKEN)
  // The session is written down BEFORE anybody can finish picking — the
  // whole point of the row, and the thing that lost seventy photographs.
  assert.deepEqual(written, [{ trip: 'trip-1', session: SESSION_ID, token: GOOGLE_TOKEN }])
  assert.ok(steps.includes('asking Google'))
  // And it came back with the two photographs, shaped for the queue.
  assert.deepEqual(out.picked.map((p) => p.googleId), ['g1', 'g2'])
})

test('and what is already on the trip is never fetched twice', async () => {
  const picked = [
    { googleId: 'g1', fetchFrom: 'https://lh3/x1', takenAtHint: '2026-05-21T10:00:00Z' },
    { googleId: 'g2', fetchFrom: 'https://lh3/x2', takenAtHint: '2026-05-21T11:00:00Z' },
  ]
  const from = {
    from: () => ({ select: () => ({ eq: async () => ({ data: [{ google_id: 'g1', fingerprint: null, taken_at: null }], error: null }) }) }),
  }
  const { fresh, already } = await onlyTheNewOnes('trip-1', picked, { from })
  assert.equal(already, 1)
  assert.deepEqual(fresh.map((f) => f.googleId), ['g2'])
})

test('the queue is handed only the new ones, against the right trip', async () => {
  const rpcs = []
  const from = {
    from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
    rpc: async (name, args) => { rpcs.push({ name, args }); return { data: 'import-1', error: null } },
  }
  const picked = [{ googleId: 'g9', fetchFrom: 'https://lh3/x9', takenAtHint: null }]
  const out = await sendThemIn('trip-1', picked, GOOGLE_TOKEN, { from })
  assert.equal(out.importId, 'import-1')
  assert.equal(out.sending, 1)
  assert.equal(rpcs[0].name, 'start_photo_import')
  assert.equal(rpcs[0].args.p_trip, 'trip-1')
  assert.equal(rpcs[0].args.p_token, GOOGLE_TOKEN)
  assert.equal(rpcs[0].args.p_items.length, 1)
})

test('recording the session names the trip, and a new-trip pick records null', async () => {
  // Null rather than the sentinel: the sweep cannot invent a trip that does
  // not exist yet, and a foreign key would refuse the string anyway.
  const rpcs = []
  const from = { rpc: async (name, args) => { rpcs.push({ name, args }); return { error: null } } }
  await rememberSession('trip-1', SESSION_ID, GOOGLE_TOKEN, { from })
  await rememberSession('new-trip', SESSION_ID, GOOGLE_TOKEN, { from })
  assert.equal(rpcs[0].name, 'open_picker_session')
  assert.equal(rpcs[0].args.p_trip, 'trip-1')
  assert.equal(rpcs[0].args.p_session, SESSION_ID)
  assert.equal(rpcs[1].args.p_trip, null)
})
