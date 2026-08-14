// Where a sign-in should come back to.
//
// Not `window.location.origin`, which is what every caller used and is the
// reason signing in with Google on Android left somebody looking at the web
// site in Chrome while the app stayed signed out.
//
// The app does not run on pond.eend.app. There is no `server.url` in
// capacitor.config.json, so the web assets are bundled into the package and
// served from a local origin — `https://localhost` on Android,
// `capacitor://localhost` on iOS. Reading the origin therefore asks Supabase
// to come back to an address that exists only inside the app, is not on the
// project's redirect allow-list, and cannot be a link Android could hand to
// anybody. Supabase does what it does with an unlisted redirect: ignores it
// and uses the project's Site URL instead — pond.eend.app — so the browser
// lands on the web site holding the session, and the app never sees it.
//
// The address it has to come back to is the App Link: the real https URL
// that Android has verified belongs to this app, via
// /.well-known/assetlinks.json and the autoVerify intent-filter. Android
// hands that to the app rather than to Chrome, and backFromTheBrowser.js
// takes the tokens off it.
//
// On the web the origin is right and stays — a preview deployment must come
// back to itself, not to production.

/** The one address Android has been told belongs to this app. */
export const APP_LINK = 'https://pond.eend.app/'

/**
 * @param native  Whether this is running inside a native wrapper. Injected
 *                so the decision can be tested without a device, which is
 *                the only place the bug ever appeared.
 * @param origin  The web origin to use when it is not native.
 */
export function comeBackTo(native, origin) {
  if (native) return APP_LINK
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
