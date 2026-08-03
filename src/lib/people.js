import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Flights record who was aboard by email, because an email is the one handle
// that survives a display-name change and matches an invite. Screens want a
// name. One fetch, cached for the session, shared by everything that has to
// print a person — profile reads are already scoped to people you know, so
// this can't enumerate anyone else's account.

let cache = null
let inflight = null
const listeners = new Set()

function load() {
  if (cache) return Promise.resolve(cache)
  inflight ??= supabase
    .from('profiles')
    .select('email,display_name')
    .then(({ data }) => {
      cache = Object.fromEntries(
        (data ?? [])
          .filter((p) => p.email)
          .map((p) => [p.email.toLowerCase(), p.display_name || p.email])
      )
      listeners.forEach((fn) => fn(cache))
      return cache
    })
  return inflight
}

/** Best available name for an email; falls back to the part before the @. */
export function nameFor(email, names = cache) {
  if (!email) return ''
  const key = email.toLowerCase()
  return names?.[key] || email.split('@')[0]
}

export function usePeopleNames() {
  const [names, setNames] = useState(cache ?? {})
  useEffect(() => {
    let alive = true
    listeners.add(setNames)
    load().then((n) => alive && setNames(n))
    return () => {
      alive = false
      listeners.delete(setNames)
    }
  }, [])
  return names
}
