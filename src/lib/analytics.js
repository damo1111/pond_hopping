import { supabase, supabaseUrl, supabaseAnonKey } from './supabase.js'

// What people do, and what breaks while they do it.
//
// This started as three events — the app opening, a tab being looked at, a
// trip being chosen — which answers "is anybody using it" and no other
// question at all. It could not say where somebody gave up during
// onboarding, whether an upload finished, how long a story took, or whether
// the thing they tapped worked.
//
// And it had no idea when the app was broken. The whole of it white-screened
// for hours on 11 August and the way anybody found out was a screenshot.
// The error boundary wrote the reason to a console on somebody else's phone.
//
// ── Two things, deliberately different ────────────────────────────────
//
//   track()  what happened. Cheap, append-only, fire and forget.
//   oops()   what broke. Deduplicated, and written down a path that still
//            works when everything else has stopped.
//
// The second is the one with the hard requirement. A crash report is
// produced at the exact moment the app is least able to do anything, so it
// may not depend on React having mounted, on supabase-js having loaded, on
// a session being readable, or on any module that might itself be what
// broke. So it goes out as a bare fetch to PostgREST with no client library
// underneath it — the only import it needs is a URL and a key, both of which
// are constants.
//
// Nothing here is ever awaited by a caller and nothing here throws. A log
// that can break the thing it is logging is worse than no log.

let noStorageId = null

const SESSION_KEY = 'ph_session_id'
const QUEUE_KEY = 'ph_queue'

/** Stamped on everything, because "it is broken" and "it has been broken
 *  since Tuesday's deploy" are different sentences. */
const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

function sessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    // Private browsing, or a webview with storage switched off. A session
    // that lasts one page is still better than dropping the report.
    return (noStorageId ??= `nostore-${Math.random().toString(36).slice(2)}`)
  }
}

/** The session id, for anything that needs a stable per-device key —
 *  variant assignment, chiefly. Exposed rather than duplicated, so a hopper
 *  cannot end up in one bucket for the test and another for the events.
 *
 *  Note what it actually is: `sessionId()` reads **localStorage**, so this
 *  survives reloads, closed tabs and days. It is a device id wearing a
 *  session's name, and the name is kept because these are grouped by string
 *  and renaming one splits its history in two. */
export function whoAmI() {
  return sessionId()
}

/**
 * Join up what this device did before there was an account.
 *
 * Everything before sign-in is written with a device id and no user id, so
 * the most interesting stretch of somebody's life in this app — the part
 * where they were deciding whether to have one — was permanently detached
 * from them. Vivien signed up on 11 August and the honest answer to "what
 * has she done" was "we cannot see", which is what analytics is for.
 *
 * Called once per signed-in launch. claim_my_events() takes only rows that
 * belong to nobody, and only ever hands them to auth.uid(), so calling it
 * twice costs one no-op query and calling it with somebody else's device id
 * requires guessing a v4 UUID.
 *
 * Never awaited, never throws — same rule as everything else here.
 */
export function joinUpTheJourney() {
  try {
    supabase.rpc('claim_my_events', { p_device: sessionId() }).then(
      ({ data }) => {
        // Only worth an event when there was actually a before to attach.
        if (data > 0) track('journey_joined_up', { events: data })
      },
      () => {}
    )
  } catch {
    // As everywhere in this file: logging must not break what it logs.
  }
}

/**
 * Where they were when it happened.
 *
 * Set by App as the tab and trip change. An event without this is still an
 * event; a crash without it is a bug report with the address torn off.
 */
let whereabouts = { tab: null, trip: null }
export function nowLooking(at = {}) {
  whereabouts = { ...whereabouts, ...at }
}

/**
 * Where they are, for anything that is not an event.
 *
 * Added for the bug reporter. A report that says which tab somebody was on
 * is a different object from one that does not, and this is already the
 * answer every event gets stamped with — reading it here rather than asking
 * React for it means the report and the events around it cannot disagree
 * about which screen this was.
 *
 * A copy, because whereabouts is module state and a caller that mutated it
 * would silently retag every subsequent event.
 */
export function whereWeAre() {
  return { ...whereabouts }
}

/**
 * Who, when there is a who.
 *
 * Told by AuthContext rather than asked of supabase-js. Asking would mean
 * either an await — which every caller here refuses to do — or reaching
 * into the client's internals, which is exactly the sort of thing that
 * changes under you and takes the logging down with it.
 */
let currentUserId = null
export function itIs(userId) {
  currentUserId = userId ?? null
}

/**
 * Something happened.
 *
 * @param event  a short, stable, snake_case name — these are grouped by
 *               string, so renaming one splits its history in two
 * @param detail anything worth knowing about it, as plain JSON
 */
export function track(event, detail) {
  if (!event) return
  try {
    const row = {
      session_id: sessionId(),
      event: String(event).slice(0, 64),
      user_id: currentUserId,
      build: BUILD,
      detail: {
        ...(detail ?? {}),
        ...(whereabouts.tab ? { tab: whereabouts.tab } : null),
        ...(whereabouts.trip ? { trip: whereabouts.trip } : null),
      },
    }
    supabase
      .from('app_events')
      .insert(row)
      .then(() => {}, () => keepForLater(row))
  } catch {
    // Never let logging be the thing that breaks.
  }
}

/**
 * Something broke.
 *
 * Deduplicated in the browser as well as in the database, because a render
 * loop can throw the same exception sixty times a second and the network is
 * not the place to find that out. The database counts what does get through.
 *
 * @param kind   crash | error | rejection | api | refused
 * @param err    an Error, or anything with a message
 * @param where  the component stack, the endpoint, whatever locates it
 */
export function oops(kind, err, where = null) {
  try {
    const message = String(err?.message ?? err ?? 'something went wrong').slice(0, 1000)
    const key = `${kind}:${message}`
    const now = Date.now()
    const said = seen.get(key)

    if (said) {
      said.count += 1
      // One report, then one more every half minute carrying the tally, so
      // a crash loop is one row that says 400 rather than 400 rows.
      if (now - said.at < 30000) return
      said.at = now
      send(kind, message, err?.stack, where, said.count)
      said.count = 0
      return
    }

    seen.set(key, { at: now, count: 0 })
    send(kind, message, err?.stack, where, 1)
  } catch {
    // As above, and more so.
  }
}

const seen = new Map()

/**
 * Out of the door without a client library.
 *
 * `keepalive` so a crash on the way to somewhere else still reports; a
 * report lost because the page unloaded is exactly the report worth having.
 */
function send(kind, message, stack, where, count) {
  const body = JSON.stringify({
    p_session: sessionId(),
    p_kind: kind,
    p_message: message,
    p_stack: stack ? String(stack).slice(0, 4000) : null,
    p_where: where ? String(where).slice(0, 2000) : null,
    p_build: BUILD,
    p_seen: count,
  })
  try {
    fetch(`${supabaseUrl}/rest/v1/rpc/note_error`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'content-type': 'application/json',
        apikey: supabaseAnonKey,
        // Signed in when there is a session, anonymous when there is not.
        // note_error() reads auth.uid() itself and is happy with either.
        authorization: `Bearer ${tokenOrKey()}`,
      },
      body,
    }).catch(() => {})
  } catch {
    // Nothing left to try, and nothing worth throwing over.
  }
}

let bearer = null
/** Told by AuthContext alongside the user id. Deliberately a plain string
 *  rather than a call into supabase-js, which may be the broken thing. */
export function tokenIs(accessToken) {
  bearer = accessToken ?? null
}
const tokenOrKey = () => bearer || supabaseAnonKey

/**
 * Events that could not be sent are kept and tried again next launch.
 *
 * This is an app for people on aeroplanes. An hour of use with no signal
 * currently logs nothing at all, which makes the quietest sessions
 * invisible — and those are the ones where things go wrong.
 */
function keepForLater(row) {
  try {
    const q = JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]')
    // A bound, because a long flight should not fill storage.
    q.push({ ...row, at: new Date().toISOString() })
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-200)))
  } catch {
    // Storage full or unavailable: the event is lost, which is the point
    // at which it stops being worth trying.
  }
}

function flushTheQueue() {
  let q = []
  try {
    q = JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]')
    if (!q.length) return
    sessionStorage.removeItem(QUEUE_KEY)
  } catch {
    return
  }
  // created_at defaults to now(), which would date every queued event to
  // the moment the signal came back. The real time travels with the row.
  const rows = q.map(({ at, ...row }) => ({
    ...row,
    detail: { ...(row.detail ?? {}), happened_at: at, sent_late: true },
  }))
  supabase
    .from('app_events')
    .insert(rows)
    .then(() => {}, () => rows.forEach(keepForLater))
}

/**
 * Everything the app throws without meaning to.
 *
 * Called once, from main.jsx, before React renders — so an exception during
 * the very first render is caught, which is precisely the failure that
 * white-screened the app and told nobody.
 */
export function watchForTrouble() {
  if (typeof window === 'undefined' || window.__pondWatching) return
  window.__pondWatching = true

  window.addEventListener('error', (e) => {
    // A failed <img> or <script> raises an error event with no `error` on
    // it. Worth knowing about — a missing chunk after a deploy looks
    // exactly like this — but it is not an exception.
    if (!e.error && e.target && e.target !== window) {
      const src = e.target.src || e.target.href
      if (src) oops('asset', { message: `failed to load ${String(src).slice(0, 200)}` }, location.pathname)
      return
    }
    oops('error', e.error ?? { message: e.message }, `${e.filename ?? ''}:${e.lineno ?? ''}`)
  })

  window.addEventListener('unhandledrejection', (e) => {
    const why = e.reason
    oops('rejection', why instanceof Error ? why : { message: String(why?.message ?? why) }, location.pathname)
  })

  window.addEventListener('online', flushTheQueue)
  flushTheQueue()
}

/**
 * One of our own endpoints said no.
 *
 * Worth its own kind: an API failure is a server problem wearing a client
 * error's clothes, and mixing it in with exceptions makes both harder to
 * read.
 */
export function apiFailed(path, status, said) {
  oops('api', { message: `${status} from ${path}${said ? ` — ${String(said).slice(0, 200)}` : ''}` }, path)
}

/**
 * A write the database declined.
 *
 * PostgREST answers a row-level-security refusal with success and no rows,
 * which is the quietest way a feature can be broken: nothing throws, nothing
 * shows, and the person assumes they did it wrong.
 */
export function refused(what, detail) {
  oops('refused', { message: `${what} wrote nothing` }, detail ? JSON.stringify(detail).slice(0, 500) : null)
}

/** How long something took, for the things worth being fast. */
export function tookMs(event, startedAt, detail) {
  track(event, { ...(detail ?? {}), ms: Math.round(performance.now() - startedAt) })
}
