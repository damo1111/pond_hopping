// Catching a sign-in that finished somewhere else.
//
// The Android build is a window onto pond.eend.app, so "continue with Google"
// leaves the app entirely — it has to, because Google refuses OAuth inside an
// embedded WebView. Google then sends the browser back to pond.eend.app, and
// until now Chrome kept it: the session landed in the browser and the app
// stayed signed out, looking broken.
//
// An App Link fixes the first half — Android now hands that address to this
// app instead of Chrome. This is the second half. The app is already running
// and already on that origin, so nothing reloads and nothing reads the URL:
// supabase-js only looks at the address bar once, at startup, and startup was
// twenty minutes ago. So the address has to be caught as it arrives and taken
// apart by hand.
//
// Web-only builds never see any of this. There is no browser to come back
// from — the redirect is an ordinary page load and supabase-js handles it.

/**
 * What a returning address is carrying, if anything.
 *
 * Supabase uses one of two shapes depending on the flow, and which one is in
 * play is a client setting that could reasonably change — so both are read
 * rather than assuming today's default holds forever:
 *
 *   implicit — tokens in the fragment: #access_token=…&refresh_token=…
 *   PKCE     — a code in the query:    ?code=…
 *
 * An error comes back the same way (#error=access_denied), and is worth
 * telling apart from "nothing here": one means somebody said no, the other
 * means this was an ordinary link.
 */
export function whatCameBack(url) {
  const text = String(url ?? '')
  if (!text) return { kind: 'nothing' }

  let parsed
  try {
    parsed = new URL(text)
  } catch {
    return { kind: 'nothing' }
  }

  // The fragment is not a query string, but it is shaped like one.
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''))
  const query = parsed.searchParams
  const either = (key) => hash.get(key) ?? query.get(key)

  const failed = either('error') ?? either('error_code')
  if (failed) {
    return {
      kind: 'refused',
      // Google's own words where it gave any; its description is readable and
      // the code is not.
      why: either('error_description') ?? failed,
    }
  }

  // Google's own token rides along in the same fragment, and was being
  // dropped on the floor.
  //
  // Supabase returns provider_token beside access_token whenever the sign-in
  // asked for provider scopes — which is exactly what connecting Google
  // Photos is. setSession() rebuilds a Supabase session from the two tokens
  // below and knows nothing about this one, so consenting to the Photos
  // scope on Android ended with the app signed in, the scope granted, and no
  // Google token anywhere: "401 not connected to Google yet", said
  // immediately after Google had said yes.
  const provider = either('provider_token')

  const access = either('access_token')
  const refresh = either('refresh_token')
  if (access && refresh) return { kind: 'tokens', access, refresh, provider }

  const code = either('code')
  if (code) return { kind: 'code', code }

  return { kind: 'nothing' }
}

/**
 * Hand it to supabase-js, whichever shape it came in.
 *
 * Returns what happened rather than throwing, because the caller is a
 * listener with nobody to catch it — an unhandled rejection inside a native
 * event handler is invisible, and this is exactly the path that was already
 * failing silently.
 */
export async function finishSignIn(url, { client } = {}) {
  const came = whatCameBack(url)
  if (came.kind === 'nothing') return came
  if (came.kind === 'refused') return came

  const auth = (client ?? (await import('./supabase.js')).supabase).auth
  // Google's own token, from whichever branch has it.
  let keep = null
  try {
    if (came.kind === 'tokens') {
      const { error } = await auth.setSession({
        access_token: came.access,
        refresh_token: came.refresh,
      })
      if (error) throw error
      keep = came.provider
    } else {
      const { data, error } = await auth.exchangeCodeForSession(came.code)
      if (error) throw error
      // And here, which is the branch that actually runs.
      //
      // supabase-js defaults to PKCE, so the redirect comes back as
      // ?code=… and there is no provider_token in the fragment to read —
      // the one above only ever fires on the implicit flow. Google's token
      // is in the *exchange result*, and that was being thrown away, which
      // is why connecting Photos ended with "401 not connected to Google
      // yet" moments after Google had granted the scope.
      keep = data?.session?.provider_token ?? null
    }
    // Written down separately, because nothing else will keep it: setSession
    // does not carry a provider token, and a later TOKEN_REFRESHED carries
    // none either. Same stash the web flow uses, so the import finds it by
    // the route it already knows.
    if (keep) {
      const { rememberGoogleToken } = await import('./googleToken.js')
      rememberGoogleToken({ provider_token: keep })
    }
    return { kind: 'signed in' }
  } catch (e) {
    return { kind: 'broken', why: e.message }
  }
}

/**
 * Listen, on the builds where there is something to listen for.
 *
 * Loaded on demand rather than imported at the top: @capacitor/app is a
 * native plugin, and on the web its import costs a request to fetch a module
 * whose every call is a no-op. Returns a function to stop listening, or null
 * where there was nothing to listen to.
 */
export async function catchTheReturn(onResult = () => {}) {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor?.isNativePlatform?.()) return null
    const { App } = await import('@capacitor/app')
    const handle = await App.addListener('appUrlOpen', async ({ url }) => {
      const said = await finishSignIn(url)
      if (said.kind !== 'nothing') onResult(said)
    })
    return () => handle.remove()
  } catch {
    // A build without the plugin, or a platform that has no such event.
    // Nothing to do, and nothing worth breaking startup over.
    return null
  }
}
