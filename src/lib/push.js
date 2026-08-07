import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase.js'

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
