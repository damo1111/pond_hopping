import { supabase } from './supabase.js'
import { PHOTOS_SCOPE } from './googlePhotos.js'
import { whereToComeBack } from './comeBackTo.js'

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
// Inside the wrappers the origin is https://localhost — the bundled assets'
// own address, which Supabase has never heard of and Android cannot hand to
// anybody. comeBackTo returns the App Link there instead.
const backHere = () => whereToComeBack()

/**
 * Where the last authorize URL is written down.
 *
 * Four separate causes were proposed for a scope that kept coming back
 * missing — the API being off, the scope not being on the consent screen, an
 * unverified app being refused, a stale token — and every one of them was a
 * guess made without looking at the request. This records what was actually
 * asked for, so the next failure can be read rather than theorised about.
 */
export const ASKED = 'pond.google.asked'

/** What the last request asked Google for, as Google saw it. */
export function whatWeAsked() {
  try {
    const url = sessionStorage.getItem(ASKED)
    if (!url) return null
    // Supabase's /authorize wraps Google's, so the scope may be on either.
    const at = new URL(url)
    return at.searchParams.get('scopes') ?? at.searchParams.get('scope') ?? null
  } catch {
    return null
  }
}

/**
 * Off to Google, by way of writing down where we sent them.
 *
 * skipBrowserRedirect hands back the URL instead of leaving immediately,
 * which is the only chance there is to record it — once the page has gone,
 * it is gone, and with it any evidence of what was requested.
 */
async function goToGoogle(options) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { skipBrowserRedirect: true, ...options },
  })
  if (error) return { data, error }
  try {
    sessionStorage.setItem(ASKED, data?.url ?? '')
  } catch {
    /* nowhere to record it is not a reason to refuse to sign in */
  }
  // No URL and no error is the quietest failure there is: the caller believes
  // it has sent somebody to Google, and the page simply stays where it was —
  // indistinguishable from a button that does nothing, which is precisely the
  // symptom this whole feature has been chasing.
  if (!data?.url) return { data, error: new Error('Google returned no sign-in address') }
  window.location.assign(data.url)
  return { data, error: null }
}

export async function connectGoogle() {
  return goToGoogle({
    scopes: SCOPES,
    redirectTo: await backHere(),
    // offline + consent so we actually get a refresh token back, needed
    // later for keeping the calendar in sync after the first session.
    queryParams: { access_type: 'offline', prompt: 'consent' },
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
  return goToGoogle({
    scopes: PHOTOS_SCOPE,
    redirectTo: await backHere(),
    // Offline here too: a thousand photographs takes longer to bring in
    // than an access token lives, so the import has to be able to carry on
    // after the first hour rather than stopping half way.
    queryParams: { access_type: 'offline', prompt: 'consent' },
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
