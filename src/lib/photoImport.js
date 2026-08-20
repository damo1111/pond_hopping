import { whatIsNew } from './alreadyHere.js'
import { filmsAmong, listPicked, openSession, pollDelay, readSession, worthImporting } from './googlePhotos.js'
import { closeAway, openAway } from './awayTab.js'

// Picking photographs out of Google, deciding which ones are actually new,
// and handing the rest to the queue.
//
// Everything expensive happens on the server; this is the part somebody
// watches. It exists as its own file rather than inside a component because
// two of the decisions here are worth testing and none of them are worth
// re-reading out of JSX.

/**
 * The client, fetched when it is wanted rather than when this file loads.
 *
 * supabase.js reads import.meta.env at module scope, so importing it at the
 * top made this whole file unloadable anywhere that is not a browser — and
 * the decisions in here (which photographs are new, what a progress bar
 * should say) are exactly the ones worth testing outside one. Every function
 * below already took `from` for injection; this is just the default.
 */
async function db(given) {
  if (given) return given
  const { supabase } = await import('./supabase.js')
  return supabase
}

/** Where "I was in the middle of importing" is written down. */
const INTENT = 'pond:importing'

/**
 * Going to Google for consent leaves the page.
 *
 * Which means the trip somebody chose, and the fact they were trying to
 * import at all, cannot live in component state — the component will be
 * unmounted and rebuilt by the time they come back. Same reason the sign-in
 * sheet writes its outstanding code down.
 */
/**
 * The trip that does not exist yet.
 *
 * Consent leaves the page, and what gets written down before leaving is the
 * trip somebody was importing into. Starting a *new* trip from Google Photos
 * has no such id — the trip is made afterwards, out of the dates on the
 * photographs they are about to pick. So it writes this down instead, and
 * the home screen knows to reopen the ways-in sheet on the photos route
 * rather than to go looking for a trip with this id.
 *
 * Deliberately not a value any real id could take: Postgres ids here are
 * uuids.
 */
export const NEW_TRIP = 'new-trip'

export function rememberIntent(tripId, store = globalThis.localStorage) {
  try {
    store?.setItem(INTENT, JSON.stringify({ tripId, at: Date.now(), afterConsent: true }))
  } catch {
    /* storage off — they land back on the tab and tap again, which is fine */
  }
}

/**
 * What we were doing, if it was recent enough to still mean anything.
 *
 * Taken rather than read: coming back from Google is the one moment this
 * matters, and leaving it behind would restart the import every time the tab
 * was reopened for the rest of the day.
 */
export function takeIntent(store = globalThis.localStorage, now = Date.now, within = 10 * 60 * 1000) {
  try {
    const raw = store?.getItem(INTENT)
    if (!raw) return null
    store?.removeItem(INTENT)
    const said = JSON.parse(raw)
    if (!said?.tripId) return null
    return now() - (said.at ?? 0) < within ? said : null
    // `afterConsent` rides along. Whoever resumes needs to know this attempt
    // already cost somebody a trip to Google, so that a second refusal is
    // reported rather than answered with a third trip.
  } catch {
    return null
  }
}

/**
 * A window opened now, pointed somewhere later.
 *
 * The picker's address does not exist until Google has answered, and by then
 * the tap that would have allowed a popup is long over — iOS in particular
 * only lets a window be opened synchronously inside the gesture. So the
 * window is opened empty on the tap and sent somewhere once there is
 * somewhere to send it.
 *
 * Returns null where the browser refused, so the caller can offer the link
 * rather than failing silently, which is what a blocked popup looks like.
 */
export function openEmptyWindow(open = globalThis.open) {
  try {
    return open?.('', '_blank') ?? null
  } catch {
    return null
  }
}

/** Google says no when the token was granted for other scopes — connecting
 *  Gmail does not come with the photographs, on purpose. */
export const needsConsent = (e) => /\b(401|403)\b/.test(String(e?.message ?? ''))

/**
 * Did this attempt already cost somebody a trip to Google's consent screen?
 *
 * A boolean question that spent a week being answered by a React
 * SyntheticEvent. The import ran from `onClick={go}`, React handed the
 * handler its event, and `afterConsent` arrived as an object — truthy, and so
 * every first refusal was treated as a second one. The branch that opens the
 * consent screen was therefore never taken, the Photos scope was never
 * requested, and the resulting message reported on a request that had never
 * been made.
 *
 * Five causes were proposed for the missing scope in that week — the API
 * being off, the scope missing from the consent screen, an unverified app, a
 * stale token, the wrong Cloud project — and the answer was that nobody had
 * asked. So this takes only the literal `true`: an event object, a string, a
 * number and an accident are all "no, and go and ask properly".
 */
export const cameFromConsent = (from) => from === true

/**
 * What Google says about a token — what it carries, and who it was issued to.
 *
 * "Insufficient authentication scopes" after a consent screen somebody just
 * approved looks identical from here whatever the cause, and four causes have
 * now been proposed and all four were wrong. So this stops theorising and
 * asks Google two questions instead.
 *
 * The second one — `aud`, the OAuth client the token was issued to — is the
 * one that was never asked and is the one that matters. The Photos Picker API
 * and the consent screen's scope list belong to a *Google Cloud project*; the
 * client id Supabase signs people in with belongs to a project too, and
 * nothing anywhere makes those the same project. When they differ, Google
 * behaves exactly as observed: it accepts the request, shows a consent screen
 * that never mentions photographs, and returns a token without the scope. No
 * error, at any point. Printing the client id turns that from an invisible
 * mismatch into a two-line comparison.
 *
 * tokeninfo needs no scope of its own — it describes the bearer.
 */
/**
 * A promise that is not allowed to take forever.
 *
 * The import hung at "checking with Google…" and stayed there. Both steps
 * before the picker reach the network — Google's tokeninfo endpoint, and
 * supabase-js reading the session — and neither had a deadline. A `try/catch`
 * around them looks like it handles the network, and it does not: catch
 * catches a *rejection*, and a request that never settles never rejects. On
 * a phone with a marginal signal the fetch simply hangs, the step never
 * advances, and the button says "checking with Google…" until the app is
 * killed. Nothing is logged, because nothing failed.
 *
 * Never rejects, and never throws. A deadline helper that can itself blow up
 * has moved the problem rather than solved it.
 *
 * @param fallback what the caller gets when the deadline passes. Chosen at
 *                 each call site to be the answer that keeps things moving —
 *                 for tokenFacts that is `null`, which the picker already
 *                 reads as "Google would not say", and already handles by
 *                 trying the token anyway.
 */
export function withDeadline(work, ms, fallback) {
  return new Promise((resolve) => {
    let settled = false
    const done = (v) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(v)
    }
    const timer = setTimeout(() => done(fallback), ms)
    try {
      Promise.resolve(typeof work === 'function' ? work() : work).then(done, () => done(fallback))
    } catch {
      done(fallback)
    }
  })
}

/** Long enough for a slow answer on a train, short enough that nobody
 *  decides the app is broken. Google's tokeninfo is one small GET. */
export const ASK_GOOGLE_MS = 6000

/** Reading a session already in memory should be instant; this is only a
 *  ceiling for the case where supabase-js is mid-refresh against a network
 *  that has gone away. */
export const READ_SESSION_MS = 4000

export async function tokenFacts(token, { fetchImpl = fetch } = {}) {
  // Aborted as well as raced, so a hung request is dropped rather than left
  // holding a socket open behind a promise nobody is waiting on any more.
  const stop = typeof AbortController === 'function' ? new AbortController() : null
  const timer = setTimeout(() => stop?.abort(), ASK_GOOGLE_MS)
  try {
    const r = await withDeadline(
      fetchImpl(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`,
        stop ? { signal: stop.signal } : undefined
      ),
      ASK_GOOGLE_MS,
      null
    )
    // Null means the deadline passed. Not knowing is not the same as knowing
    // the token is wrong, and the caller treats it that way.
    if (!r || !r.ok) return null
    const said = await r.json()
    return {
      scopes: String(said.scope ?? '').split(/\s+/).filter(Boolean),
      // `aud` is the client the token was minted for; `azp` is who asked.
      // They are the same thing for a browser flow, but not every response
      // carries both.
      clientId: said.aud ?? said.azp ?? null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const PHOTOS = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'

/**
 * What to say when Google refuses after somebody has just granted access.
 *
 * Every earlier version of this named a cause, and every one of them was
 * wrong: the API was off, the scope was missing from the consent screen, the
 * app was unverified, the token was stale. Four confident sentences, four
 * evenings. So this one names no cause. It prints the three facts that
 * distinguish between the remaining ones — what we asked for, what came back,
 * and which OAuth client Google issued it to — and leaves the reading to
 * somebody who can see both consoles.
 */
export function stillRefused(e, facts, asked) {
  const said = String(e?.message ?? '').replace(/^session failed:\s*/, '')
  const granted = facts?.scopes ?? null
  // The one case where the app is at fault rather than a console setting:
  // we never put the scope in the request. Said first and said plainly,
  // because everything else is somebody else's switch and this one is mine.
  if (asked !== null && asked !== undefined && !String(asked).includes('photospicker')) {
    return `The app did not ask Google for the Photos scope at all. It asked for: ${asked || 'nothing'}`
  }
  if (Array.isArray(granted) && !granted.includes(PHOTOS)) {
    return (
      'The app asked Google for your photographs and Google returned a token without them — ' +
      'no consent screen mentioned photographs, and no error was raised. ' +
      `Sign-in client: ${facts?.clientId ?? 'unknown'}. ` +
      'The Photos Picker API and the scope live on one Google Cloud project; that client id ' +
      'belongs to whichever project it was made in. If those are two different projects, this ' +
      'is exactly what it looks like. ' +
      `We asked for: ${asked ?? 'unrecorded'}. The token came back with: ${
        granted.length ? granted.join(', ') : 'no scopes at all'
      }.`
    )
  }
  return `Google refused again, even after access was granted. It said: ${said || 'nothing useful'}`
}

/**
 * A wait that ends early when somebody comes back to this tab.
 *
 * Choosing happens in Google's tab, which means this one is in the
 * background for the whole of it — and a background tab's timers are
 * throttled to about once a minute, sometimes far worse. So the moment
 * somebody finishes picking and switches back, the next check can be up to a
 * minute away, on a screen showing a bar that is not moving. Long enough to
 * conclude nothing happened, close the tab, and be right.
 *
 * Coming back to the tab is the strongest possible signal that picking is
 * over. It costs one poll to act on it.
 */
function restUntilBackOrElapsed(ms) {
  return new Promise((resolve) => {
    const doc = globalThis.document
    let over = false
    const finish = () => {
      if (over) return
      over = true
      clearTimeout(timer)
      globalThis.removeEventListener?.('focus', finish)
      doc?.removeEventListener?.('visibilitychange', onShown)
      resolve()
    }
    const onShown = () => {
      if (doc?.visibilityState === 'visible') finish()
    }
    const timer = setTimeout(finish, ms)
    globalThis.addEventListener?.('focus', finish)
    doc?.addEventListener?.('visibilitychange', onShown)
  })
}

/**
 * Wait for somebody to finish choosing.
 *
 * Google's own interval is honoured rather than a number picked here, and
 * the whole thing gives up eventually — a picker window closed without
 * choosing anything would otherwise poll until the tab was shut.
 */
export async function waitForPick(token, sessionId, { read = readSession, sleep, patience = 10 * 60 * 1000 } = {}) {
  const rest = sleep ?? restUntilBackOrElapsed
  const until = Date.now() + patience
  for (;;) {
    const said = await read(token, sessionId)
    if (said?.mediaItemsSet) return said
    if (Date.now() > until) throw new Error('nothing was picked')
    await rest(pollDelay(said?.pollingConfig))
  }
}

/**
 * Which of these is the trip missing?
 *
 * Rules 0 and 2 — Google's id, and the timestamp-capacity rule — run here,
 * against what the trip already holds, *before* anything is sent anywhere.
 * They are the two that need no file, so a re-import of nine hundred
 * photographs costs nine hundred lines of JSON rather than nine hundred
 * downloads. Rule 1 needs the bytes and runs on the server, last.
 */
export async function onlyTheNewOnes(tripId, picked, { from } = {}) {
  const client = await db(from)
  const { data, error } = await client
    .from('photos')
    .select('google_id,fingerprint,taken_at')
    .eq('trip_id', tripId)
  if (error) throw error
  return whatIsNew(
    picked.map((p) => ({ ...p, takenAt: p.takenAtHint ?? null })),
    data ?? []
  )
}

/**
 * The token as it is *now*, not as it was when some earlier page load stashed
 * one.
 *
 * google.js keeps provider_token in sessionStorage because Supabase only
 * surfaces it in the instant after an OAuth round trip and never again. That
 * is fine for reading it later — and wrong at exactly this moment. Coming
 * back from the Photos consent screen, the stash may still hold the token
 * from an ordinary sign-in, which carries email and profile and nothing else.
 * Reading it then produces a confident, wrong report that Google refused the
 * scope, when in fact nobody ever asked with the new token.
 *
 * So the live session wins where it has one, and the stash is the fallback.
 */
export async function freshToken({ from } = {}) {
  try {
    const client = await db(from)
    const { data } = await client.auth.getSession()
    if (data?.session?.provider_token) return data.session.provider_token
  } catch {
    /* fall through to whatever was written down */
  }
  try {
    const { getGoogleToken } = await import('./google.js')
    return getGoogleToken()
  } catch {
    // google.js reaches the Supabase client at module scope, so this whole
    // path is unloadable outside a browser. Returning null lets the caller
    // say "not connected to Google", which is true, rather than throwing
    // something unrelated about an environment variable.
    return null
  }
}

/**
 * Every Google token this app might be holding, newest-looking first.
 *
 * There can be two, and until now the wrong one was always chosen.
 *
 * Signing in *with* Google leaves a provider_token on the persisted session
 * carrying email and profile and nothing else. Later, connecting Google
 * Photos mints a second token that does carry the Photos scope. freshToken
 * preferred the live session, so it handed back the first — and Google
 * answered, entirely correctly, that there were no photographs on it. Which
 * read as "Google returned a token without them", printed under a button
 * somebody had just used to grant exactly that scope.
 *
 * Neither source is reliably the newer one, so neither wins by position.
 * The caller asks Google which of them carries the scope and uses that.
 */
/**
 * Hand a refresh token to the server, once, and forget it here.
 *
 * Called on every auth event, and almost every one of them carries nothing —
 * worthKeeping is what stops this being a request per token refresh. The
 * token is never written to storage on this side; see googleGrant.js for
 * why that matters more than anything else in this file.
 */
export async function keepTheGrant(session, { post, say } = {}) {
  const { worthKeeping } = await import('./googleGrant.js')
  // Dynamic, for the reason db() is: analytics.js imports supabase.js, which
  // reads import.meta.env at module scope, and a static import of it makes
  // this whole file unloadable outside a browser — which is where every
  // decision in it is tested.
  const tell = say ?? (await import('./analytics.js')).track

  // Ordinary token refreshes carry no provider fields at all, and
  // onAuthStateChange fires for every one of them. Recording those would
  // bury the four that matter under a thousand that do not.
  if (!session?.provider_token && !session?.provider_refresh_token) return false

  // This is the landing.
  //
  // google.js has a comment describing `google_landed` as "the signature of
  // a redirect that never took" — and the event was never implemented, so a
  // departure to Google could not be told apart from a departure that came
  // back empty. A session carrying provider fields IS the return: there is
  // no other way one appears.
  tell('google_landed', { refresh: session.provider_refresh_token ? 'yes' : 'no' })

  if (!worthKeeping(session)) {
    // Google came back without a refresh token — so the fault is upstream of
    // us, at what was asked for, rather than in the write. That one
    // distinction is what a week of theorising could not make, because this
    // function returned false three different ways and said nothing about
    // which.
    tell('google_grant_absent')
    return false
  }

  const send = post ?? (await import('./apiBase.js')).callApi
  try {
    await send('/api/google-grant', {
      method: 'POST',
      auth: true,
      body: {
        refresh_token: session.provider_refresh_token,
        scopes: session.provider_scopes ?? null,
      },
    })
    tell('google_grant_kept')
    return true
  } catch (e) {
    // Said, not swallowed. Nothing on screen is waiting for this and the app
    // still works without it — but "we had one and could not store it" and
    // "we were never given one" need completely different fixes, and until
    // now they looked identical from the outside. Which is what they looked
    // like: nothing.
    tell('google_grant_refused', { why: String(e?.message ?? e).slice(0, 120) })
    return false
  }
}

/**
 * An access token minted from the kept grant, or null.
 *
 * This is the one that turns "connect Google Photos" from something you do
 * every session into something you did once. Null covers three different
 * situations on purpose — never connected, not configured, Google having a
 * bad minute — because the caller's answer to all three is the same: carry
 * on with the tokens you have, and if there are none, the consent screen.
 *
 * The exception is a *withdrawn* grant, which is worth saying out loud, and
 * is returned as a thrown 403 so the existing consent branch catches it.
 */
export async function tokenFromGrant({ ask } = {}) {
  const { usable, withdrawn } = await import('./googleGrant.js')
  const get = ask ?? (await import('./apiBase.js')).callApi
  let said
  let status = 0
  try {
    // The path carries /api/, and the answer is read from the body.
    //
    // Both were wrong here, which is two bugs in one call and the reason
    // this function has never once returned a token. Without the prefix the
    // request went to a hostname that does not exist; and `usable()` below
    // was handed the Response object rather than the JSON, so even a request
    // that arrived would have produced null. Nothing about that is visible
    // from the outside: the caller reads null as "not connected" and sends
    // somebody to a consent screen, which is exactly what it did.
    const res = await get('/api/google-grant', { method: 'GET', auth: true })
    // The body is read whether or not the status was ok, because the two
    // refusals that matter are told apart by what is *in* it: 404 with
    // "not connected" is somebody who has never connected, and 403 with
    // "invalid_grant" is somebody who revoked us. Reading only the status
    // would report the second as the first and quietly ask them to connect
    // a Google account they had deliberately disconnected.
    status = res?.status ?? 0
    said = (await res?.json?.().catch(() => null)) ?? { error: 'not connected' }
  } catch (e) {
    // callApi throws with the status in the message; a withdrawn grant has
    // to reach the consent path rather than being swallowed as "no token".
    if (/\b403\b/.test(String(e?.message ?? ''))) {
      throw new Error('403 your Google connection was withdrawn')
    }
    return null
  }
  if (withdrawn(said, status)) throw new Error('403 your Google connection was withdrawn')
  return usable(said)
}

export async function googleTokens({ from } = {}) {
  const found = []
  try {
    const client = await db(from)
    // Same reason as tokenFacts: getSession() can sit on a refresh against a
    // network that has gone away, and this is the first thing the import
    // does. A missing token here is not a failure — the stash below may
    // still have one, and an empty list sends somebody to consent, which is
    // a screen rather than a spinner.
    const { data } = (await withDeadline(client.auth.getSession(), READ_SESSION_MS, null)) ?? {}
    if (data?.session?.provider_token) found.push(data.session.provider_token)
  } catch {
    /* no session is not an error here — the stash may still have one */
  }
  try {
    const { getGoogleToken } = await import('./googleToken.js')
    const stashed = getGoogleToken()
    // Written at every OAuth return, so it is the likelier of the two to be
    // the newest — but "likelier" is not "known", which is the whole point.
    if (stashed && !found.includes(stashed)) found.push(stashed)
  } catch {
    // google.js reaches the Supabase client at module scope, so this path is
    // unloadable outside a browser.
  }
  return found
}

/** Hand the list to the queue. Returns the run's id to watch. */
/**
 * The pick, written down before anybody goes and makes it.
 *
 * Seventy photographs were chosen, Google said "Done!", and nothing arrived.
 * Not a failure — a loss. The session id existed in exactly one place: the
 * variable below, in the tab that opened the picker. Signing in again
 * replaced that tab, and Google has no endpoint that lists a person's
 * sessions, so an id nobody wrote down is a pick that cannot be recovered by
 * anyone, ever.
 *
 * One row, written before the picker opens. From then on the polling in this
 * file is an optimisation — it still finishes in seconds when the tab is
 * alive — and the sweep on the server is the mechanism.
 *
 * Never throws. A recording step that could stop somebody picking has made
 * things worse, not better; the worst case here is exactly the behaviour we
 * had before, which is what this is insurance against.
 *
 * @param tripId the trip, or NEW_TRIP — recorded as null, because the trip
 *               does not exist yet and the sweep cannot invent it. Written
 *               down regardless: a pick nobody can name is the whole bug.
 */
export async function rememberSession(tripId, sessionId, token, { from } = {}) {
  try {
    const client = await db(from)
    const { error } = await client.rpc('open_picker_session', {
      p_trip: tripId && tripId !== NEW_TRIP ? tripId : null,
      p_session: sessionId,
      p_token: token,
    })
    return !error
  } catch {
    return false
  }
}

export async function startImport(tripId, items, token, { from } = {}) {
  const client = await db(from)
  const { data, error } = await client.rpc('start_photo_import', {
    p_trip: tripId,
    p_items: items,
    p_token: token,
  })
  if (error) throw error
  return data
}

/** How far along, as the person watching should read it. */
export async function howFarAlong(importId, { from } = {}) {
  const client = await db(from)
  const { data, error } = await client.rpc('photo_import_progress', { p_import: importId })
  if (error) throw error
  return asProgress(Array.isArray(data) ? data[0] : data)
}

/**
 * The counts, shaped for a sentence rather than a table.
 *
 * `settled` is what a progress bar should follow: a photograph already in
 * the trip is finished business even though nothing was fetched for it, and
 * a bar that ignored those would sit still through nine hundred skips and
 * look wedged.
 */
export function asProgress(row) {
  const n = (v) => Number(v ?? 0)
  const total = n(row?.total)
  const done = n(row?.done)
  const skipped = n(row?.skipped)
  const failed = n(row?.failed)
  const settled = done + skipped + failed
  return {
    total,
    done,
    skipped,
    failed,
    waiting: n(row?.waiting),
    settled,
    // Never 100% while anything is still waiting, and never NaN on an empty
    // run, which is the state this is in for the first second of every import.
    part: total > 0 ? Math.min(1, settled / total) : 0,
    finished: Boolean(row?.finished_at),
    note: row?.note ?? null,
  }
}

/**
 * What to say about it, in a sentence.
 *
 * The old version listed counters — "1 in · 0 already here" — which is a
 * table read aloud, and at the end of a journey that has already taken
 * somebody through two tabs and a consent screen it is not an arrival. It
 * says the machine finished; it does not say the photographs are here.
 *
 * Kept out of the component so the wording can be argued with in a test
 * rather than by squinting at a screenshot.
 */
export function howItWent(p) {
  if (!p) return null
  const n = (x) => Number(x || 0).toLocaleString('en-GB')
  const photos = (x) => (Number(x) === 1 ? '1 photograph is' : `${n(x)} photographs are`)

  if (!p.finished) {
    // Nothing settled yet is the first second of every import, and a count of
    // "0 of 8" there reads as stuck rather than as starting.
    return p.settled ? `Bringing them in — ${n(p.settled)} of ${n(p.total)}` : 'Bringing them in…'
  }
  if (p.done && p.skipped) return `${photos(p.done)} in. ${n(p.skipped)} were already here.`
  if (p.done) return `${photos(p.done)} in.`
  if (p.skipped) return p.skipped === 1 ? 'That one was already here.' : 'They were all already here.'
  if (p.failed) return 'None of them would come.'
  return 'Nothing came in.'
}

/**
 * Choosing, with no trip in mind.
 *
 * This half of the import knows nothing about where the photographs are
 * going, and it had no reason to — it was written inside bringThemIn, which
 * takes a trip id, so Google Photos could only ever add to a trip that
 * already existed. "Start from photos" is the door that *makes* a trip out
 * of a pile of photographs, and it could only read a pile off the phone.
 * Which is backwards for the case it exists to serve: the trip that happened
 * two years ago is exactly the one whose photographs are no longer on the
 * phone.
 *
 * The split is possible because Google hands over each item's creation time
 * with the pick, before a single byte is fetched — so the dates that decide
 * what the trip is are already here, and the trip can be made from them and
 * then filled.
 *
 * Returns the token as well as the picks, because the token that was proven
 * to carry the scope is the one the send must use, and asking again would be
 * a second chance to pick the wrong one.
 */
export async function pickFromGoogle({
  onStep = () => {},
  onPicker = () => {},
  onFilms = () => {},
  token,
  facts: askGoogle = tokenFacts,
  open = openSession,
  tokens = googleTokens,
  rest = (ms) => new Promise((r) => setTimeout(r, ms)),
  show = openAway,
  hide = closeAway,
  fromGrant = tokenFromGrant,
  // The trip this pick is for, so it can be written down before the picker
  // opens. Optional only because a new-trip pick has no id yet.
  intoTrip = null,
  remember = rememberSession,
  // The two calls to Google after the picker opens. Seams, for the same
  // reason as the rest: without them the flow between "session opened" and
  // "here is what they picked" cannot be run at all except by hand, with a
  // real Google account and real photographs.
  poll = waitForPick,
  list = listPicked,
} = {}) {
  // Whichever of the tokens we hold actually carries the Photos scope.
  //
  // Asked of Google rather than guessed at by which was written down last: a
  // token from an ordinary Google sign-in and a token from the Photos
  // consent screen are indistinguishable from here, and picking the wrong
  // one produces a refusal that reads exactly like Google withholding the
  // scope it has just granted. Which is what it read like.
  //
  // One list whether the caller supplied a token or not, so a supplied one
  // is held to the same test. It was not, and the check it skipped was the
  // one that sends somebody to consent instead of to an error.
  onStep('checking with Google')

  // Twice, a beat apart, because the good token may still be arriving.
  //
  // Coming back from consent inside a wrapper, two things start at once: the
  // appUrlOpen listener exchanging the code for a session that carries the
  // new Google token, and this import resuming because the app came
  // forward. The resume usually wins. It then reads the session as it was a
  // moment ago — the old sign-in token, email and profile and nothing else —
  // and reports that Google refused the scope it has just granted.
  //
  // Nothing here can order those two: they are different listeners on
  // different events, and the one that matters is not ours to wait on. So
  // the question is asked again after a pause, and only a second empty
  // answer counts.
  const pick = async () => {
    const found = token ? [token] : await tokens()
    for (const candidate of found) {
      const facts = await askGoogle(candidate)
      // A token Google will not describe is still worth trying: not knowing
      // is not the same as knowing it is wrong.
      if (!facts || facts.scopes.includes(PHOTOS)) return { key: candidate, found }
    }
    return { key: null, found }
  }

  let { key, found: candidates } = await pick()
  if (!key) {
    await rest(1200)
    ;({ key, found: candidates } = await pick())
  }

  // Nothing in the browser carries it — so ask the server whether this
  // person connected Google Photos at some point in the past.
  //
  // This is the whole point of the grant. The two sources above are a
  // session token and a sessionStorage stash, and both are gone the moment
  // the app is closed; the grant is not. Tried here rather than first
  // because a token already in hand costs no round trip, and tried *before*
  // the throw because everything below this line is the consent screen.
  //
  // A withdrawn grant throws its own 403 from in here, which is right: that
  // is a thing to tell somebody, and the consent path is the answer to it.
  if (!key) {
    const granted = await fromGrant().catch((e) => {
      if (/\b403\b/.test(String(e?.message ?? ''))) throw e
      return null
    })
    if (granted) {
      const facts = await askGoogle(granted)
      if (!facts || facts.scopes.includes(PHOTOS)) key = granted
    }
  }

  // Held one, and none of them carried it. Shaped as a 403 so the caller's
  // consent path runs — this is a scope to be granted, not a failure.
  if (!key && candidates.length) {
    throw new Error('403 this sign-in does not carry access to your photographs')
  }
  // None at all, which is the ordinary case rather than an error: somebody
  // who signed in with an emailed code has never been near Google. Also a
  // 401, so the same consent path runs — connecting Google Photos is its own
  // decision and has nothing to do with how somebody signed in.
  if (!key) {
    throw new Error('401 not connected to Google yet')
  }

  onStep('asking Google')
  const session = await open(key)

  // Written down before the picker is opened, not after it closes.
  //
  // Everything below this line assumes this tab is still here when the pick
  // lands, and once it was not. The row is what makes that assumption
  // optional. Awaited — it is one small insert and it must be in place
  // before anybody can possibly finish choosing.
  await remember(intoTrip, session.id, key)

  // Handed out, not opened.
  //
  // This used to open an empty window on the tap and point it at the picker
  // once Google answered. Both halves fail. A window opened inside the
  // gesture is fine, but the address does not exist until two network round
  // trips later, and by then the gesture has expired — Chrome refuses the
  // navigation and leaves the tab reading `about:blank#blocked`. Opening it
  // outright at that point is refused too, for the same reason, and inside a
  // Capacitor webview neither was ever going to work.
  //
  // So the caller is given the address and puts a real link on the screen.
  // A tap on an anchor with an href is a navigation no popup blocker has an
  // opinion about, on any platform. Polling below carries on regardless, so
  // whether they tap now or in a minute makes no difference to the result.
  onPicker(session.pickerUri)
  // In the wrappers, open it ourselves in a Custom Tab so we are able to put
  // it away again. Everywhere else this does nothing and the card's link is
  // the way through.
  await show(session.pickerUri)

  onStep('waiting for you to choose')
  await poll(key, session.id)

  // Picking is over. Put the picker away and come back here.
  //
  // Handed to Chrome, the picker ends on Google's own dead end — "Done!
  // Continue in the other app or device" — and stays there, because that
  // page has never heard of us. Somebody has just finished choosing and the
  // last thing the flow does is abandon them in another app.
  //
  // Opened in a Custom Tab it is a sheet this app owns, so it can be closed
  // the moment the pick lands. On the web there is nothing to close and
  // asking for focus is the most that is allowed.
  try {
    await hide()
    globalThis.focus?.()
  } catch {
    /* the import matters more than the housekeeping */
  }

  onStep('reading what you picked')
  const everything = await list(key, session.id)
  const picked = worthImporting(everything)
  // Films are left where they are — see isPhoto. Counted rather than dropped
  // in silence: picking twenty videos and getting eighty photographs back,
  // with no mention of the twenty, reads as an import that lost things.
  const films = filmsAmong(everything)
  if (!picked.length) throw new Error('nothing was picked')

  if (films) onFilms(films)

  return { key, picked, films }
}

/**
 * The picks, into a trip.
 *
 * The half that needs a trip id, kept separate from the half that does not —
 * so a trip made a moment ago out of these very photographs' dates can be
 * filled by the same code that fills one made a year ago.
 *
 * @param picked  what pickFromGoogle returned, or a subset of it. A subset is
 *                the ordinary case for a new trip: a camera roll handed over
 *                whole splits into several trips, and only one of them is
 *                being made right now.
 */
export async function sendThemIn(tripId, picked, key, { onStep = () => {}, from } = {}) {
  onStep('checking what is already here')
  // `from` threaded rather than dropped. Both calls below default to the
  // real client when it is absent, and without passing it there is no way to
  // exercise this function outside a browser — which is how every bug in
  // this file so far reached production.
  const { fresh, already } = await onlyTheNewOnes(tripId, picked, { from })
  if (!fresh.length) return { importId: null, sending: 0, already }

  onStep('handing them over')
  const importId = await startImport(tripId, fresh, key, { from })
  return { importId, sending: fresh.length, already }
}

/** Everything between the tap and the queue, for a trip that already exists.
 *  The caller supplies `onStep` so the sheet can say where it has got to
 *  without this knowing about it. */
export async function bringThemIn(tripId, opts = {}) {
  // The trip goes down the front half too, so the session can be recorded
  // against it before the picker opens. It was only ever known to the back
  // half, which is why a lost tab lost the pick.
  const { key, picked } = await pickFromGoogle({ intoTrip: tripId, ...opts })
  return sendThemIn(tripId, picked, key, opts)
}

/**
 * The trip somebody left for Google from, without spending the intent.
 *
 * Coming back from consent lands on whatever redirectTo said, which is the
 * site's root — so somebody who left from a trip's Photos tab returns to the
 * home screen. BringThemIn is the thing that resumes the import and it only
 * exists on that Photos tab, so nothing resumes: they arrive somewhere else
 * entirely, with no message, and have to find their own way back and tap
 * again. Reported as "it took me back to the app home screen and I had to
 * tap Google Photos twice".
 *
 * Deliberately a peek and not takeIntent(). The intent is consumed by
 * whoever actually resumes; routing must not eat it on the way past, or the
 * screen it navigates to arrives with nothing left to act on — which would
 * turn two taps into a dead end.
 */
export function comingBackTo(store = globalThis.localStorage, now = Date.now, within = 10 * 60 * 1000) {
  try {
    const raw = store?.getItem(INTENT)
    if (!raw) return null
    const said = JSON.parse(raw)
    if (!said?.tripId) return null
    return now() - (said.at ?? 0) < within ? said.tripId : null
  } catch {
    return null
  }
}

/**
 * Do we already hold a token that carries the Photos scope?
 *
 * Asked so the card can be in the right state before anybody taps anything.
 *
 * The flow was two taps, every single time: "Google Photos" opened a picker
 * session and turned itself into a link, and then that link had to be tapped
 * as well. The second tap is not decoration — a picker address can only be
 * *followed* by a gesture, so it has to be a real link rather than something
 * opened after an await. But nothing said the first tap had to be the thing
 * that created the session. Consent, once given, is remembered by Google;
 * only this app kept re-asking the question from scratch.
 *
 * So the session is made in advance where the scope is already held, the
 * button is a link on arrival, and one tap goes straight to Google.
 */
export async function alreadyConnected({ tokens = googleTokens, facts = tokenFacts } = {}) {
  const found = await tokens()
  for (const candidate of found) {
    const said = await facts(candidate)
    // Same rule as the import itself: a token Google will not describe is
    // still worth holding on to. Being unable to ask is not a refusal.
    if (!said || said.scopes.includes(PHOTOS)) return candidate
  }
  return null
}
