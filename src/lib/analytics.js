import { supabase } from './supabase.js'

// A tiny first-party usage log — this is a tab-based SPA with no real
// per-tab URLs, so generic page-view analytics (Vercel/GA) would only
// ever see one page. Logging events straight into Supabase instead means
// David can ask for real usage (which tabs, which trips) without a new
// account/dashboard, and RLS only grants INSERT (no SELECT policy), so
// the anon key can never read anyone else's usage back out.
const SESSION_KEY = 'ph_session_id'

function sessionId() {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

// Fire-and-forget — never awaited by callers, never blocks rendering.
export function track(event, detail) {
  supabase
    .from('app_events')
    .insert({ session_id: sessionId(), event, detail: detail ?? null })
    .then(() => {}, () => {})
}
