import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Boundary from './components/Boundary.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'
import { watchForTrouble } from './lib/analytics.js'
import { watchForCrashes } from './lib/sentry.js'
import 'leaflet/dist/leaflet.css'
import './styles/globals.css'

// Before anything renders, and before the service worker below, because the
// failure this exists for is an exception thrown during the very first
// render. That is what white-screened the app on 11 August, and the only
// way anybody found out was a screenshot.
watchForTrouble()

// And the same crashes, somewhere they can be read.
//
// After watchForTrouble, never before it: that one is a bare fetch with no
// library underneath, so it still reports when the thing that broke is a
// library. This one is fetched asynchronously and does nothing at all
// without VITE_SENTRY_DSN, so it costs nothing until it is switched on.
// Deliberately not awaited — the app must not wait for a crash reporter.
watchForCrashes()

// The service worker already skipWaiting()/clientsClaim()s on a new
// deploy, but an already-open tab keeps running its old in-memory JS
// until something reloads it — without this, a fresh deploy silently
// doesn't show up until the user thinks to hard-refresh.
//
// This can fire the instant the page opens (an old SW registration
// already installed gets superseded by whatever just deployed), which
// used to reload immediately — including mid-boot-animation, which
// looked like the header flickering in, vanishing, then "reappearing"
// as the reloaded page redid its own boot from scratch. App.jsx defers
// the actual reload until its boot sequence has settled.
if ('serviceWorker' in navigator) {
  let fired = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (fired) return
    fired = true
    window.__pondSwUpdatePending = true
    window.dispatchEvent(new Event('pond:sw-update'))
  })

  // A browser only looks for a new service worker on navigation, and an
  // installed PWA on a phone is opened once and left for days — so a fix can
  // ship and simply never arrive. Ask explicitly: when the app comes back to
  // the foreground, and hourly while it's there.
  navigator.serviceWorker.ready.then((reg) => {
    const check = () => document.visibilityState === 'visible' && reg.update()
    document.addEventListener('visibilitychange', check)
    setInterval(check, 60 * 60 * 1000)
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Outside AuthProvider on purpose: a session that cannot be read, or a
        profile fetch that throws, is exactly the kind of failure that used to
        leave a blank page with no way back. */}
    <Boundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Boundary>
  </React.StrictMode>
)
