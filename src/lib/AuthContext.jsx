import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { rememberGoogleToken } from './google.js'
import { registerPush } from './push.js'
import { joinUpTheJourney } from './analytics.js'
import { itIs, tokenIs, track } from './analytics.js'

export const AuthContext = createContext({
  session: null,
  user: null,
  profile: null,
  authLoading: true,
  refreshProfile: async () => null,
})

// Tracks the signed-in session (if any) and the matching profiles row.
// Deliberately non-blocking: public trips still render signed-out, which
// is what makes a fresh install show a spinning globe full of real
// journeys rather than an empty state. Writing anything, though, now
// requires a session — RLS was tightened to trip-editor scope.
// The usage log holds who and which token, because it will not ask
// supabase-js for either — a crash report has to go out when the client
// library may be exactly what broke, so it needs a plain string it already
// has rather than a call it might not survive.
function tellTheLog(session) {
  itIs(session?.user?.id ?? null)
  tokenIs(session?.access_token ?? null)
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      rememberGoogleToken(data.session)
      tellTheLog(data.session)
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      rememberGoogleToken(s)
      tellTheLog(s)
      // Named events rather than a session diff, because "signed in" and
      // "the token refreshed itself" look identical from the outside and
      // only one of them is a person doing something.
      if (event === 'SIGNED_IN') track('signed_in')
      if (event === 'SIGNED_OUT') track('signed_out')
      if (event === 'USER_UPDATED') track('account_updated')
      setSession(s)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const loadProfile = useCallback(async (uid) => {
    if (!uid) return null
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    setProfile(data ?? null)
    return data ?? null
  }, [])

  useEffect(() => {
    let alive = true
    if (!session?.user) {
      setProfile(null)
      return
    }
    loadProfile(session.user.id).then((d) => {
      if (!alive) setProfile((p) => p ?? d)
    })
    // Re-register the device on every signed-in launch: FCM tokens rotate,
    // and a stale one silently stops delivering. No-ops on the web build.
    registerPush(session.user.email)
    // And claim whatever this device did before there was an account to
    // attach it to. Here rather than in the sign-in screen because it has
    // to happen on every signed-in launch, not only the one where somebody
    // typed a code: the events worth stitching are often from the visit
    // before the visit they signed up on.
    joinUpTheJourney()
    return () => {
      alive = false
    }
  }, [session?.user?.id, session?.user?.email, loadProfile])

  // Onboarding writes to profiles and needs the provider to notice, rather
  // than the flow reappearing on the next render.
  const refreshProfile = useCallback(
    () => loadProfile(session?.user?.id),
    [loadProfile, session?.user?.id]
  )

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, authLoading, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
