import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase.js'
import { whereToFromTap } from './pushRoute.js'

// Push notifications, native only. The web build deliberately does nothing:
// browser push needs a service-worker subscription and VAPID keys, which is
// a separate mechanism from FCM device tokens, and the people who want to
// be told "a booking just arrived" are the ones with the app installed.
//
// Tokens rotate — on reinstall, on restore, occasionally on their own — so
// this re-registers on every launch and upserts rather than treating a
// token as something you store once.
/**
 * What this device thinks is true about notifications.
 *
 * Registration fails in four different ways and every one of them is silent:
 * the caller in AuthContext throws the result away, and there is no console
 * to read on a phone. So the answer has to be readable in the app itself.
 */
export async function pushDiagnostics() {
  const out = { platform: Capacitor.getPlatform(), native: Capacitor.isNativePlatform() }
  if (!out.native) return { ...out, permission: 'n/a', note: 'the web build never registers' }
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    out.permission = (await PushNotifications.checkPermissions())?.receive ?? 'unknown'
  } catch (err) {
    out.permission = 'no-plugin'
    out.note = String(err)
  }
  return out
}

// ── The tap ────────────────────────────────────────────────────────────
//
// Held here rather than handed straight to a callback, because of the case
// that matters most: the app is not running, the notification is tapped,
// and the tap is what launches it. The event fires during startup — before
// the session has been restored, before the trip list exists, and before
// anything that could act on it has mounted. A listener attached later
// never hears it, which is exactly what used to happen, and the symptom is
// the app opening on the wrong screen with nothing in the logs.
//
// So: listen as early as possible, keep the destination, and hand it over
// when somebody asks for it. A tap is worth remembering for the length of
// a launch; it is never worth acting on twice.
let pending = null
let handler = null
let listening = false

/**
 * Start listening. Safe to call repeatedly and deliberately not gated on
 * being signed in — the tap that launches the app arrives long before the
 * session does.
 */
export async function listenForPushTaps() {
  if (listening || !Capacitor.isNativePlatform()) return
  listening = true
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const go = whereToFromTap(action)
      // No destination is a real answer: an admin ping has no screen behind
      // it, and opening the app is the whole of what it wanted.
      if (!go) return
      if (handler) handler(go)
      else pending = go
    })
  } catch {
    // No plugin, or the platform refused. Nothing to do, and nothing that
    // should stop the app starting.
    listening = false
  }
}

/**
 * Ask to be told where to go, and be told immediately if a tap is already
 * waiting. Returns the usual unsubscribe.
 */
export function onPushTap(fn) {
  handler = fn ?? null
  if (fn && pending) {
    const go = pending
    pending = null
    fn(go)
  }
  return () => {
    if (handler === fn) handler = null
  }
}

export async function registerPush(email) {
  if (!email || !Capacitor.isNativePlatform()) return { ok: false, reason: 'not-native' }

  let PushNotifications
  try {
    ({ PushNotifications } = await import('@capacitor/push-notifications'))
  } catch {
    return { ok: false, reason: 'plugin-missing' }
  }

  try {
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') return { ok: false, reason: 'denied' }

    return await new Promise((resolve) => {
      // Listeners must be attached before register() or the token event
      // can fire before anything is listening for it.
      PushNotifications.addListener('registration', async ({ value }) => {
        // The write was unchecked, so a token that arrived and then failed
        // RLS looked exactly like a token that never arrived — which is two
        // very different problems wearing the same empty table.
        const { error } = await supabase.from('push_tokens').upsert(
          {
            token: value,
            email,
            platform: Capacitor.getPlatform(),
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'token' }
        )
        resolve(
          error
            ? { ok: false, reason: `save failed: ${error.message}`, gotToken: true }
            : { ok: true, token: `${String(value).slice(0, 12)}…` }
        )
      })
      PushNotifications.addListener('registrationError', (err) =>
        resolve({ ok: false, reason: String(err?.error || err) })
      )
      PushNotifications.register()
      // Don't hang the caller forever if neither event ever fires.
      setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 15000)
    })
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
}

// Stop this device receiving anything — used on sign-out, so a shared or
// handed-on phone doesn't keep getting someone else's bookings.
export async function unregisterPush() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.removeAllListeners()
  } catch {
    // nothing to do
  }
}
