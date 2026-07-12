import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

export const AuthContext = createContext({
  session: null,
  user: null,
  profile: null,
  authLoading: true,
})

// Tracks the signed-in session (if any) and the matching profiles row.
// Deliberately non-blocking — the rest of the app works whether or not
// anyone's signed in, since RLS hasn't been switched over from the
// original open policies yet. This just makes "who's signed in" available
// to whichever screen wants it (currently: the Account tab).
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let alive = true
    if (!session?.user) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => alive && setProfile(data ?? null))
    return () => {
      alive = false
    }
  }, [session?.user?.id])

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, authLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
