import { Capacitor, registerPlugin } from '@capacitor/core'
import { supabase } from './supabase.js'

// Background location, iOS only — and deliberately so for now. Safari has
// no background geolocation at all, so the PWA can never do this, and
// Android's equivalent is a different API with a different permission
// story and a Play Console declaration to go with it. One platform, one
// tester, one honest proof that the idea works.
//
// The native half is ios/App/App/VisitTracker.swift; read the note at the
// top of it for why the buffering lives down there rather than up here.
const VisitTracker = registerPlugin('VisitTracker')

export const visitsSupported = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

// { enabled, authorization, pending } — or null anywhere the plugin isn't.
export async function visitStatus() {
  if (!visitsSupported()) return null
  try {
    return await VisitTracker.status()
  } catch {
    // An older TestFlight build won't have the plugin compiled in.
    return null
  }
}

export async function enableVisits() {
  if (!visitsSupported()) return { enabled: false, reason: 'unsupported' }
  const { authorization } = await VisitTracker.request()
  if (authorization === 'denied' || authorization === 'restricted') {
    return { enabled: false, authorization }
  }
  // "whenInUse" is worth starting on: iOS offers the upgrade to Always by
  // itself, later, once it can see the app genuinely uses this — and until
  // then visits still arrive whenever the app is open.
  return await VisitTracker.start()
}

export async function disableVisits() {
  if (!visitsSupported()) return
  await VisitTracker.stop()
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
