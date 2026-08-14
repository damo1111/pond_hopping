import { whatIsNew } from './alreadyHere.js'
import { listPicked, openSession, pollDelay, readSession, worthImporting } from './googlePhotos.js'

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
export async function tokenFacts(token, { fetchImpl = fetch } = {}) {
  try {
    const r = await fetchImpl(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`
    )
    if (!r.ok) return null
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
 * Wait for somebody to finish choosing.
 *
 * Google's own interval is honoured rather than a number picked here, and
 * the whole thing gives up eventually — a picker window closed without
 * choosing anything would otherwise poll until the tab was shut.
 */
export async function waitForPick(token, sessionId, { read = readSession, sleep, patience = 10 * 60 * 1000 } = {}) {
  const rest = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
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

/** Hand the list to the queue. Returns the run's id to watch. */
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

/** Everything between the tap and the queue. The caller supplies `onStep`
 *  so the sheet can say where it has got to without this knowing about it. */
export async function bringThemIn(tripId, { onStep = () => {}, token, win = null } = {}) {
  const key = token ?? (await freshToken())
  if (!key) throw new Error('not connected to Google')

  onStep('asking Google')
  const session = await openSession(key)
  if (win) win.location = session.pickerUri
  else globalThis.open?.(session.pickerUri, '_blank')

  onStep('waiting for you to choose')
  await waitForPick(key, session.id)

  onStep('reading what you picked')
  const picked = worthImporting(await listPicked(key, session.id))
  if (!picked.length) throw new Error('nothing was picked')

  onStep('checking what is already here')
  const { fresh, already } = await onlyTheNewOnes(tripId, picked)
  if (!fresh.length) return { importId: null, sending: 0, already }

  onStep('handing them over')
  const importId = await startImport(tripId, fresh, key)
  return { importId, sending: fresh.length, already }
}
