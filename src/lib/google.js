import { supabase } from './supabase.js'
import { PHOTOS_SCOPE } from './googlePhotos.js'

// Gmail read + Calendar write, granted in one Google consent screen.
// read-only on mail (we never send/delete), events on calendar (create a
// "Pond Hopping" calendar and keep it in sync — not read the user's whole
// calendar).
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.events'].join(' ')

// The trailing slash is load-bearing, for the same reason it is in
// AuthSheet: Supabase matches redirectTo against the allow-list with globs
// in which `.` and `/` are both separators, so `https://host/**` cannot
// match a bare origin. Sent bare, the match fails and Supabase quietly
// returns you to the project's Site URL instead — which reads as the app
// being broken rather than as a redirect being refused. Fixed in the sign-in
// sheet days ago; this copy was missed.
const backHere = () => `${window.location.origin}/`

export async function connectGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: SCOPES,
      redirectTo: backHere(),
      // offline + consent so we actually get a refresh token back, needed
      // later for keeping the calendar in sync after the first session.
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
}

/**
 * Photographs only.
 *
 * Deliberately its own consent screen rather than another scope bolted onto
 * connectGoogle(). Somebody who wants sixteen days of Japan out of Google
 * Photos should not be asked to hand over their inbox in the same breath —
 * and the reverse: connecting Gmail to find a booking should not quietly
 * come with access to every photograph they have ever taken.
 *
 * The picker scope is narrow by construction. It grants nothing until the
 * hopper picks, and then only the things they picked — Google never opens
 * the library to us at all.
 */
export async function connectGooglePhotos() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: PHOTOS_SCOPE,
      redirectTo: backHere(),
      // Offline here too: a thousand photographs takes longer to bring in
      // than an access token lives, so the import has to be able to carry on
      // after the first hour rather than stopping half way.
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
