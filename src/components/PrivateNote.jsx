import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// Never read by ShareView — structurally can't leak into a share link.
export default function PrivateNote({ tripId, date }) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [saved, setSaved] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    supabase
      .from('private_notes')
      .select('body')
      .eq('trip_id', tripId)
      .eq('note_date', date)
      .limit(1)
      .then(({ data }) => {
        if (!alive) return
        setBody(data?.[0]?.body ?? '')
        setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [tripId, date])

  async function save() {
    setSaving(true)
    const { error } = await supabase
      .from('private_notes')
      .upsert(
        { trip_id: tripId, note_date: date, body, updated_at: new Date().toISOString() },
        { onConflict: 'trip_id,note_date' }
      )
    setSaving(false)
    setSaved(!error)
  }

  return (
    <div className="private-note" onClick={(e) => e.stopPropagation()}>
      <button className="pn-toggle" onClick={() => setOpen((o) => !o)}>
        <span>🔒 Private note</span>
        <span className="pn-hint">{open ? 'hide' : loaded && body ? 'has a note' : 'add a note'}</span>
      </button>
      {open && (
        <div className="pn-body">
          <div className="pn-sub">Only visible to you — never included in Share links.</div>
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
          <button className="pn-save" disabled={saving || saved} onClick={save}>
            {saving ? 'saving…' : saved ? 'saved ✓' : 'save'}
          </button>
        </div>
      )}
    </div>
  )
}
