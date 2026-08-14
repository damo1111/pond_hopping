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
 * Which scopes a token actually carries, asked of Google rather than assumed.
 *
 * "Insufficient authentication scopes" after a consent screen somebody just
 * approved has several possible causes and they look identical from here:
 * a stale token still in the tab, an unverified app being quietly refused a
 * sensitive scope, or the wrong project's client. Guessing between them is
 * what produced two wrong answers already, so this asks.
 *
 * tokeninfo needs no scope of its own — it describes the bearer.
 */
export async function scopesOn(token, { fetchImpl = fetch } = {}) {
  try {
    const r = await fetchImpl(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`
    )
    if (!r.ok) return null
    const said = await r.json()
    return String(said.scope ?? '').split(/\s+/).filter(Boolean)
  } catch {
    return null
  }
}

const PHOTOS = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'

/**
 * What to say when Google refuses after somebody has just granted access.
 *
 * The first version named one cause — the Photos Picker API not being
 * switched on — and was wrong the first time it was seen in anger: the API
 * was on. So this reads the token instead of theorising about it. If the
 * scope genuinely is not on there after an approval, the cause is almost
 * always that Google declined to grant a *sensitive* scope to an app it has
 * not verified, which is a thing only the console can fix.
 */
export function stillRefused(e, granted, asked) {
  const said = String(e?.message ?? '').replace(/^session failed:\s*/, '')
  // The one case where the app is at fault rather than the console: we never
  // put the scope in the request. Said first, because everything else is
  // somebody else's setting and this one is mine.
  if (asked !== null && asked !== undefined && !String(asked).includes('photospicker')) {
    return `The app did not ask Google for the Photos scope at all. It asked for: ${asked || 'nothing'}`
  }
  if (Array.isArray(granted) && !granted.includes(PHOTOS)) {
    return (
      'Google approved the sign-in but did not actually grant access to your photographs. ' +
      'That happens when the app has not been verified — the Photos scope is a sensitive one, ' +
      'and an unverified app is refused it without saying so. ' +
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
