import { Capacitor } from '@capacitor/core'

// The web build serves /api/* same-origin, so a relative path just works.
// Wrapped in Capacitor, the app runs from capacitor://localhost (iOS) or
// http://localhost (Android) instead — relative paths would hit the
// device itself, not Vercel — so native builds need the real origin.
export const API_BASE = Capacitor.isNativePlatform() ? 'https://pond.eend.app' : ''
