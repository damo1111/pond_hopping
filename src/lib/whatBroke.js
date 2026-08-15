// Everything the app can answer for itself, so nobody is asked "what build?"
//
// The single most useless question in software is asked of every tester:
// which version, which device, which screen, were you online. Nobody knows.
// Half the answers that do come back are wrong — twice this fortnight an
// identical message arrived from two different builds, and the second
// reading cost a round of debugging a defect that was already gone.
//
// The app knows all of it. So the report asks for one thing — what were you
// trying to do — and fills in the rest itself.
//
// Pure, and takes its world as arguments, so what gets attached to a report
// can be tested without a phone.

/**
 * @param where  { tab, trip } — the same whereabouts analytics already keeps
 * @param env    the bits of the browser worth recording, injected so this is
 *               testable and so a missing one is never a thrown error inside
 *               a bug reporter, of all places
 */
export function whatWeKnow({ build = 'dev', where = {}, env = {} } = {}) {
  const {
    platform = 'web',
    width = null,
    height = null,
    agent = null,
    online = null,
    url = null,
  } = env

  return {
    build,
    tab: where.tab ?? null,
    trip: where.trip ?? null,
    platform,
    // Both numbers, because "it is cut off on my phone" is a report about a
    // width and half the layout bugs this app has had were one.
    screen: width && height ? `${Math.round(width)}x${Math.round(height)}` : null,
    agent: agent ? String(agent).slice(0, 400) : null,
    online,
    url: url ? String(url).slice(0, 300) : null,
  }
}

/** The world, read off whatever globals actually exist. Every one of these is
 *  optional in a webview, and none of them is worth throwing over. */
export function readEnv(g = globalThis) {
  const out = {}
  try {
    out.platform = g.Capacitor?.getPlatform?.() ?? 'web'
  } catch {
    out.platform = 'web'
  }
  try {
    out.width = g.innerWidth ?? null
    out.height = g.innerHeight ?? null
  } catch {
    /* no window */
  }
  try {
    out.agent = g.navigator?.userAgent ?? null
    // Deliberately `!== false`: a browser with no navigator.onLine is far
    // more likely to be online than off, and "offline" is a claim that sends
    // somebody looking in the wrong place.
    out.online = g.navigator?.onLine !== false
  } catch {
    /* no navigator */
  }
  try {
    out.url = g.location?.href ?? null
  } catch {
    /* no location */
  }
  return out
}

/** Nothing but whitespace is a mis-tap, not a report. Matched by the same
 *  rule in report_a_problem(), which is the one that actually enforces it —
 *  this is only so the button can say so before the trip to the server. */
export function worthSending(said) {
  return typeof said === 'string' && said.trim().length > 0
}

/**
 * What the button says, and whether it can be pressed.
 *
 * Four states in one place rather than four ternaries in the JSX, because
 * the one that matters is `failed` — a report that silently did not send is
 * strictly worse than no reporter at all. Somebody who believes they have
 * told you goes quiet.
 */
export function sendState({ said = '', sending = false, sent = false, failed = false } = {}) {
  if (sent) return { label: 'Sent — thank you', can: false, done: true }
  if (sending) return { label: 'Sending…', can: false }
  if (failed) return { label: 'Try again', can: worthSending(said), bad: true }
  return { label: 'Send it', can: worthSending(said) }
}
