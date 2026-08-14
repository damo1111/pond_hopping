// Where a sign-in should come back to.
//
// Not `window.location.origin`, which is what every caller used and is the
// reason signing in with Google on Android left somebody looking at the web
// site in Chrome while the app stayed signed out.
//
// The two wrappers do not even agree on what that origin is. iOS bundles the
// web assets and serves them from `capacitor://localhost`, because App Store
// review treats a remote-URL wrapper as failing the minimum functionality
// bar. Android rewrites capacitor.config.json at build time to point at
// https://pond.eend.app, so the shell is a window onto the live site and web
// fixes reach it without a new APK. So on iOS the origin is a scheme Supabase
// has never heard of, and on Android it is the right address for entirely the
// wrong reason — which is worse, because it looks like it works.
//
// It does not, and the reason is below.

/**
 * The address the wrappers come back to.
 *
 * A custom scheme, not the https App Link, and the difference is the whole
 * bug. An App Link is honoured when Android *dispatches* a URL — a tapped
 * link, a fresh load. The OAuth return is not that: Google redirects to
 * Supabase, Supabase redirects to us, all inside one browser session that is
 * already open. Chrome follows its own redirect chain and keeps the result,
 * verified domain or not.
 *
 * Which is why sending the App Link changed nothing, on a build that had the
 * change in it: Android was already asking to come back to pond.eend.app, and
 * pond.eend.app arriving as the end of a redirect chain is a page Chrome
 * renders, not an intent Android dispatches.
 *
 * A custom scheme has no such rule. There is nothing to verify and no
 * question of how the navigation started: the browser cannot render it, so
 * it hands it to whatever registered it, every time.
 *
 * Registered in AndroidManifest.xml alongside the App Link intent-filter,
 * which stays — it is still right for somebody tapping a pond.eend.app link
 * in a message, which is a dispatch and does work.
 */
export const COME_BACK = 'app.eend.pond://auth'

/** Still true, and still what an ordinary link to the site should do. */
export const APP_LINK = 'https://pond.eend.app/'

/**
 * @param native  Whether this is running inside a native wrapper. Injected
 *                so the decision can be tested without a device, which is
 *                the only place the bug ever appeared.
 * @param origin  The web origin to use when it is not native.
 */
export function comeBackTo(native, origin) {
  if (native) return COME_BACK
  // The trailing slash is load-bearing. Supabase matches redirectTo against
  // the allow-list with globs in which `.` and `/` are both separators, so
  // `https://host/**` cannot match a bare origin. Sent bare, the match fails
  // and Supabase quietly returns you to the Site URL instead — which reads as
  // the app being broken rather than as a redirect being refused.
  return `${String(origin ?? '').replace(/\/+$/, '')}/`
}

/** The same decision, asking the platform itself. */
export async function whereToComeBack() {
  let native = false
  try {
    const { Capacitor } = await import('@capacitor/core')
    native = Boolean(Capacitor?.isNativePlatform?.())
  } catch {
    /* no Capacitor here — this is a browser */
  }
  return comeBackTo(native, globalThis.location?.origin)
}
