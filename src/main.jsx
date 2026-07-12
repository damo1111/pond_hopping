import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'
import 'leaflet/dist/leaflet.css'
import './styles/globals.css'

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
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
