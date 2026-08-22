import { supabase } from './supabase.js'

// Remembering where somebody lives.
//
// Two stores, and the awkwardness is the point: the question is asked before
// anybody has signed up, so the answer has nowhere on the server to live when
// it is given. It goes to the device immediately and to the profile whenever
// there is a profile to put it in.
//
// The device copy is not a cache of the server's. It is the answer, and the
// server copy is how it follows somebody to their next phone.

const KEY = 'pond:home'

/** What this device says, or null. Never throws — storage can be off. */
export function readHome(store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(KEY)
    return raw && /^[a-z]{2}$/.test(raw) ? raw : null
  } catch {
    // Private browsing, or a WebView with storage disabled. Not knowing where
    // somebody lives is recoverable — asking again is one screen. Throwing
    // during boot is not.
    return null
  }
}

/** Write it here, now. Returns what was stored so callers can trust one value. */
export function writeHome(code, store = globalThis.localStorage) {
  const iso = String(code || '').toLowerCase()
  if (!/^[a-z]{2}$/.test(iso)) return null
  try {
    store?.setItem(KEY, iso)
  } catch {
    /* the answer still stands for this session */
  }
  return iso
}

/**
 * Put it on the profile too, if there is one.
 *
 * Deliberately fire-and-forget from the caller's point of view: somebody
 * answering "where's home" must not wait on a round trip, and must not be
 * shown an error if it fails. The device already knows, and the next sync
 * puts it right.
 */
export async function syncHome(code, client = supabase) {
  const iso = String(code || '').toLowerCase()
  if (!/^[a-z]{2}$/.test(iso)) return { saved: false, reason: 'not-a-country' }
  try {
    const {
      data: { user },
    } = await client.auth.getUser()
    if (!user) return { saved: false, reason: 'signed-out' }
    const { error } = await client.from('profiles').update({ home_country: iso }).eq('id', user.id)
    return error ? { saved: false, reason: error.message } : { saved: true }
  } catch (e) {
    return { saved: false, reason: e?.message ?? 'offline' }
  }
}

/**
 * The profile's answer, brought back to a device that has never been asked.
 *
 * This is the second-phone case: somebody who said "Australia" last year on
 * another handset should not be asked again here. Only ever fills a gap —
 * where the device already has an answer, that one wins, because it is the
 * more recent thing the person in front of us actually said.
 */
export async function adoptHome(client = supabase, store = globalThis.localStorage) {
  if (readHome(store)) return readHome(store)
  try {
    const {
      data: { user },
    } = await client.auth.getUser()
    if (!user) return null
    const { data } = await client.from('profiles').select('home_country').eq('id', user.id).maybeSingle()
    return data?.home_country ? writeHome(data.home_country, store) : null
  } catch {
    return null
  }
}
