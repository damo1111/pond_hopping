import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from './supabase.js'
import { ASK_MS, CALL_MS, settled } from './settled.js'

// Background location, on both apps. Not on the web: Safari and Chrome have
// no background geolocation at all, so a PWA can never do this — a tab that
// isn't open records nothing, and pretending otherwise would be the worst
// kind of promise.
//
// The two native halves are ios/App/App/VisitTracker.swift and
// android/app/src/main/java/app/eend/pond/VisitTracker.java. They arrive at
// the same place by very different routes — iOS is handed stops by CLVisit,
// Android works them out from a slow trickle of fixes — but they expose the
// same six methods and the same five authorization strings, so nothing above
// this line knows or cares which one is answering.
const VisitTracker = registerPlugin('VisitTracker')

export const visitsSupported = () => Capacitor.isNativePlatform()


/** Android asks in two goes; the second one lives in Settings from 11 on. */
export const visitsNeedSettings = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

export async function openLocationSettings() {
  try {
    await VisitTracker.settings()
  } catch {
    // iOS has no such method, and nothing here should depend on it.
  }
}

// { enabled, authorization, pending } — or null anywhere the plugin isn't.
export async function visitStatus() {
  if (!visitsSupported()) return null
  // undefined from settled() means "no answer", which is not the same as
  // "no plugin" — but for a status read there is nothing useful to do with
  // the distinction, and null is what every caller already handles.
  return (await settled(VisitTracker.status(), CALL_MS)) ?? null
}

// Consent, remembered here rather than inferred from whether the recorder
// happens to be running. The recorder starts and stops with your trips; the
// answer to "may we" is given once and only changed by you.
const CONSENT_KEY = 'pond:visits'

export function hasConsented(store = globalThis.localStorage) {
  try {
    return store?.getItem(CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

export function setConsent(yes, store = globalThis.localStorage) {
  try {
    if (yes) store?.setItem(CONSENT_KEY, '1')
    else store?.removeItem(CONSENT_KEY)
  } catch {
    /* nothing to do */
  }
}

export async function enableVisits() {
  if (!visitsSupported()) return { enabled: false, reason: 'unsupported' }
  const asked = await settled(VisitTracker.request(), ASK_MS)
  // No answer at all. Say so rather than reporting a refusal, because the
  // two want different words on screen and only one of them is the user's
  // doing.
  if (!asked) return { enabled: false, reason: 'no-answer' }
  const { authorization } = asked
  if (authorization === 'denied' || authorization === 'restricted') {
    return { enabled: false, authorization }
  }
  // "whenInUse" is worth starting on either way: visits still arrive
  // whenever the app is open, and the upgrade to always-on can come later.
  // iOS offers it by itself once it has seen the app genuinely use this;
  // Android sends people to Settings for it, which is what
  // openLocationSettings() is for.
  return (await settled(VisitTracker.start(), CALL_MS)) ?? { enabled: false, reason: 'no-answer' }
}

export async function disableVisits() {
  if (!visitsSupported()) return
  await settled(VisitTracker.stop(), CALL_MS)
}

/// Moves whatever the phone buffered into Postgres. Safe to call often —
/// it's a no-op with nothing pending.
export async function syncVisits() {
  if (!visitsSupported()) return { synced: 0 }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { synced: 0, reason: 'signed-out' }

  let visits = []
  try {
    ;({ visits = [] } = await VisitTracker.pending())
  } catch {
    return { synced: 0, reason: 'no-plugin' }
  }
  if (!visits.length) return { synced: 0 }

  const rows = visits.map((v) => ({
    user_id: user.id,
    visit_key: v.key,
    lat: v.lat,
    lng: v.lng,
    // -1 is CoreLocation's "couldn't say", which is not a distance.
    accuracy_m: v.accuracy >= 0 ? v.accuracy : null,
    arrived_at: v.arrivedAt ?? null,
    departed_at: v.departedAt ?? null,
  }))

  const { error } = await supabase
    .from('location_visits')
    .upsert(rows, { onConflict: 'user_id,visit_key' })
  if (error) return { synced: 0, error: error.message }

  // Only let go of the phone's copy once Postgres has it. A failed upload
  // leaves the buffer alone and the next foreground simply tries again.
  await VisitTracker.clear({ keys: rows.map((r) => r.visit_key) })
  return { synced: rows.length }
}

// Sync on open and on every return to the foreground. Uses
// visibilitychange rather than @capacitor/app so there's no new native
// dependency for something the web platform already reports.
export function installVisitSync() {
  if (!visitsSupported()) return () => {}
  const run = () => {
    syncVisits().catch(() => {})
  }
  run()
  const onVisible = () => {
    if (document.visibilityState === 'visible') run()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}
