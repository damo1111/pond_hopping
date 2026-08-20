// Crashes on somebody else's phone.
//
// oops() already writes exceptions to app_events, and it stays: it is a bare
// fetch with no library underneath it, so it still works when the thing that
// broke is the library. What it cannot do is turn a minified React trace
// back into a line of source, group a thousand instances of one fault into
// one entry, or tell you the fault arrived with the build you shipped an
// hour ago. That is what this is for.
//
// ── Why the web SDK is enough for the phones too ─────────────────────────
//
// The wrappers point at https://pond.eend.app — ci_post_clone.sh rewrites
// capacitor.config.json to the live site unless ios/STORE_BUILD is present.
// So the iOS and Android apps are running this JavaScript in a WebView, and
// a JavaScript exception in the app *is* a web exception. @sentry/capacitor
// would add native crash reporting on top, which needs a pod install and a
// native rebuild, and catches a class of fault a Capacitor shell rarely has.
// Not worth coupling this to the wrapper release cycle today.
//
// ── Nothing until there is a DSN ─────────────────────────────────────────
//
// Absent VITE_SENTRY_DSN this does nothing at all, and the SDK is never even
// fetched. That is the state the app ships in until somebody sets it, and it
// must be a state that costs nothing rather than one that throws.

/** Public by design — it identifies a project, it does not authorise
 *  anything, and it travels in the browser bundle of every app that uses
 *  Sentry. The auth token that uploads source maps is the secret, and it
 *  lives only on the build machine. */
const DSN = import.meta.env?.VITE_SENTRY_DSN || ''

/** Which build, said the same way app_events says it — so an entry here and
 *  a row there can be lined up against the same deploy, which is the whole
 *  reason __BUILD_ID__ exists. */
const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

let started = false

/**
 * Start watching, out of the critical path.
 *
 * Imported dynamically rather than at the top of main.jsx, because the SDK
 * is around 25KB gzipped and the first thing a stranger does with this app
 * is wait for it to appear on mobile data. An error thrown before this
 * resolves is still caught — the browser's own `error` event is what Sentry
 * hooks, and watchForTrouble() has been listening since the first line of
 * main.jsx regardless.
 *
 * Never throws. A crash reporter that can crash the app is worse than none,
 * which is the rule oops() already follows.
 */
export async function watchForCrashes({ dsn = DSN, load } = {}) {
  if (started || !dsn) return false
  started = true
  try {
    // A client built by hand, rather than init() from the barrel.
    //
    // Both shorter routes were measured and both ship a session recorder
    // this app does not use. `import('@sentry/react')` hands back a
    // namespace object, and a bundler cannot tree-shake a namespace — every
    // export is kept, replayIntegration included, which pulls in rrweb.
    // Naming the export does not help either, because init() references the
    // default integration list statically and that list contains replay.
    // 156KB gzipped both ways: not a crash reporter, a second application.
    //
    // BrowserClient is Sentry's own documented answer. Nothing arrives that
    // is not named here, so the seven integrations below are the entire
    // cost, and the ones that turn an exception into something readable:
    // the error, the breadcrumb trail before it, the promise nobody caught,
    // and the deduplication that stops one fault filling a dashboard.
    // Destructured, and that is not a style choice — see the note above.
    // `const S = await import(...)` is itself a namespace, so writing the
    // hand-built client that way keeps every export anyway and undoes the
    // whole point of building it by hand. Named bindings are what rollup
    // can actually drop.
    const {
      BrowserClient,
      makeFetchTransport,
      defaultStackParser,
      getCurrentScope,
      inboundFiltersIntegration,
      functionToStringIntegration,
      breadcrumbsIntegration,
      globalHandlersIntegration,
      linkedErrorsIntegration,
      dedupeIntegration,
      httpContextIntegration,
    } = load ? await load() : await import('@sentry/browser')
    const client = new BrowserClient({
      dsn,
      transport: makeFetchTransport,
      stackParser: defaultStackParser,
      integrations: [
        inboundFiltersIntegration(),
        functionToStringIntegration(),
        breadcrumbsIntegration(),
        globalHandlersIntegration(),
        linkedErrorsIntegration(),
        dedupeIntegration(),
        httpContextIntegration(),
      ],
      release: BUILD,
      environment: BUILD.startsWith('ios') ? 'ios' : BUILD === 'dev' ? 'dev' : 'web',
      // Off. This app is somebody's photographs, their flights and where
      // they slept; none of that belongs in a third party's error tool, and
      // the default is to send more than you would choose to.
      sendDefaultPii: false,
      beforeSend: scrubbed,
    })
    getCurrentScope().setClient(client)
    client.init()
    return true
  } catch {
    // Blocked by an extension, refused by the network, or a chunk that did
    // not load. All of them mean no crash reporting, and none of them is a
    // reason to stop the app.
    started = false
    return false
  }
}

/**
 * What must not leave the building.
 *
 * A trip slug is a place and a set of dates, an email address is a person,
 * and a Supabase or Google token in a URL is a credential — all three end up
 * in breadcrumbs and request URLs without anybody deciding they should.
 *
 * Exported and pure so the redaction can be tested, which is the only way to
 * be sure of it: the failure mode is invisible from inside the app and only
 * shows up as somebody's address sitting in a third-party dashboard.
 */
export function scrubbed(event) {
  if (!event) return event
  try {
    const clean = (s) =>
      String(s)
        // Anything that looks like a credential in a query string.
        .replace(/\b(access_token|refresh_token|provider_token|code|state|key|apikey|token)=[^&\s]+/gi, '$1=[removed]')
        // Addresses.
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    if (event.request?.url) event.request.url = clean(event.request.url)
    if (Array.isArray(event.breadcrumbs)) {
      for (const crumb of event.breadcrumbs) {
        if (crumb?.data?.url) crumb.data.url = clean(crumb.data.url)
        if (typeof crumb?.message === 'string') crumb.message = clean(crumb.message)
      }
    }
    if (typeof event.message === 'string') event.message = clean(event.message)
  } catch {
    /* a scrubber that throws must not become the crash it was watching for */
  }
  return event
}
