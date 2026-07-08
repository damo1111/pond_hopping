import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import 'leaflet/dist/leaflet.css'
import './styles/globals.css'

// The service worker already skipWaiting()/clientsClaim()s on a new
// deploy, but an already-open tab keeps running its old in-memory JS
// until something reloads it — without this, a fresh deploy silently
// doesn't show up until the user thinks to hard-refresh.
if ('serviceWorker' in navigator) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
