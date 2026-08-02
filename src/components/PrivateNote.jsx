import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'

// Notes come in three tiers, and this component owns the private two:
//   private — only you, ever
//   shared  — everyone on the trip, never on a public share link
// (the third, public, is a journal entry.)
//
// Never read by ShareView, so neither tier can leak into a share link
// structurally, not just by policy.
export default function PrivateNote({ tripId, date }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [others, setOthers] = useState([])
  const [saved, setSaved] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    // RLS returns your own notes plus anything shared with the trip, so one
    // query gets both — split them by author rather than asking twice.
    supabase
      .from('private_notes')
      .select('body,author,visibility')
      .eq('trip_id', tripId)
      .eq('note_date', date)
      .then(({ data }) => {
        if (!alive) return
        const rows = data ?? []
        const me = rows.find(
          (r) => (r.author || '').toLowerCase() === (user?.email || '').toLowerCase() || !r.author
        )
        setBody(me?.body ?? '')
        setVisibility(me?.visibility ?? 'private')
        setOthers(rows.filter((r) => r !== me))
        setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [tripId, date, user?.email])

  async function save(nextVisibility = visibility) {
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('private_notes').upsert(
      {
        trip_id: tripId,
        note_date: date,
        body,
        author: user.email,
        visibility: nextVisibility,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'trip_id,note_date,author' }
    )
    setSaving(false)
    setSaved(!error)
  }

  const shared = visibility === 'shared'

  return (
    <div className="private-note" onClick={(e) => e.stopPropagation()}>
      <button className="pn-toggle" onClick={() => setOpen((o) => !o)}>
        <span>{shared ? '👥 Shared note' : '🔒 Private note'}</span>
        <span className="pn-hint">
          {open ? 'hide' : loaded && (body || others.length) ? 'has a note' : 'add a note'}
        </span>
      </button>
      {open && (
        <div className="pn-body">
          {!user && <div className="pn-sub">Sign in to write notes.</div>}

          {others.map((o, i) => (
            <div key={i} className="pn-other">
              <div className="pn-other-who">{o.author?.split('@')[0] || 'someone'} wrote</div>
              <div className="pn-other-body">{o.body}</div>
            </div>
          ))}

          {user && (
            <>
              <div className="pn-sub">
                {shared
                  ? 'Everyone on this trip can see this. Never included in Share links.'
                  : 'Only visible to you. Never included in Share links.'}
              </div>
              <textarea
                className="pn-textarea"
                rows={4}
                placeholder="Type or dictate here…"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  setSaved(false)
                }}
              />
              <div className="pn-actions">
                <button
                  className="pn-vis"
                  onClick={() => {
                    const next = shared ? 'private' : 'shared'
                    setVisibility(next)
                    if (body) save(next)
                  }}
                >
                  {shared ? 'make private' : 'share with the trip'}
                </button>
                <button className="pn-save" disabled={saving || saved} onClick={() => save()}>
                  {saving ? 'saving…' : saved ? 'saved ✓' : 'save'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
