import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { rememberGoogleToken } from './google.js'

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
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      rememberGoogleToken(data.session)
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      rememberGoogleToken(s)
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
    return () => {
      alive = false
    }
  }, [session?.user?.id, loadProfile])

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
