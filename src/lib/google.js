import { supabase } from './supabase.js'

// Gmail read + Calendar write, granted in one Google consent screen.
// read-only on mail (we never send/delete), events on calendar (create a
// "Pond Hopping" calendar and keep it in sync — not read the user's whole
// calendar).
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.events'].join(' ')

export async function connectGoogle() {
  const redirectTo = window.location.origin
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: SCOPES,
      redirectTo,
      // offline + consent so we actually get a refresh token back, needed
      // later for keeping the calendar in sync after the first session.
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
}

// Supabase surfaces the Google access token as session.provider_token,
// but only right after the OAuth round-trip — it isn't persisted across
// reloads. We stash it so an import kicked off moments later still has it,
// and treat "no token" as "reconnect Gmail".
const KEY = 'pond.google.token'

export function rememberGoogleToken(session) {
  if (session?.provider_token) {
    try {
      sessionStorage.setItem(KEY, session.provider_token)
    } catch {
      /* private mode — token just lives for this tab's memory instead */
    }
  }
}

export function getGoogleToken() {
  try {
    return sessionStorage.getItem(KEY) || null
  } catch {
    return null
  }
}

export function clearGoogleToken() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
