import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import DayMap from '../components/DayMap.jsx'
import DayScrubber from '../components/DayScrubber.jsx'
import TripSummary from '../components/TripSummary.jsx'
// PrivateNote is temporarily not rendered anywhere — the main app URL has
// no login, so its "hidden from Share links" guarantee doesn't extend to
// someone just browsing the app directly. Component/table untouched;
// re-enable the <PrivateNote> render below once real access control ships.
// import PrivateNote from '../components/PrivateNote.jsx'

const MOODS = ['😄', '🌅', '🏃', '🤔', '😮', '😤', '🌧️', '✈️', '🧱', '🌀', '🧵', '🌊']

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function Entry({ e, autoOpen, jumpKey }) {
  const [open, setOpen] = useState(autoOpen)
  const ref = useRef(null)

  useEffect(() => {
    if (autoOpen && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [autoOpen])

  // Fires on every scrubber tap, not just at mount — unlike autoOpen,
  // which only matters for the initial cross-tab deep link.
  useEffect(() => {
    if (jumpKey == null) return
    setOpen(true)
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [jumpKey])

  return (
    <div
      ref={ref}
      className={`journal-entry${open ? ' open' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(ev) => ev.key === 'Enter' && setOpen((o) => !o)}
    >
      <div className="je-top">
        <span className="je-mood">{e.mood || '·'}</span>
        <span className="je-day">{e.day_number ? `DAY ${e.day_number}` : ''}</span>
        <span className="je-date">{fmtDate(e.entry_date)}</span>
        <span className="je-city">{e.city}</span>
      </div>
      <div className="je-title">{e.title}</div>
      <div className={`je-note${open ? '' : ' clamp'}`}>{e.note}</div>
      {open && (
        <div onClick={(ev) => ev.stopPropagation()}>
          <DayMap tripId={e.trip_id} date={e.entry_date} />
        </div>
      )}
      {open && e.tags?.length > 0 && (
        <div className="je-tags">
          {e.tags.map((t) => (
            <span key={t} className="je-tag">#{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function AddEntry({ tripMeta, selectedTrip, onSaved }) {
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    trip: selectedTrip || tripMeta[0]?.slug || '',
    date: new Date().toISOString().slice(0, 10),
    city: '',
    title: '',
    note: '',
    mood: '😄',
    tags: '',
  })
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }))

  async function save() {
    const trip = tripMeta.find((t) => t.slug === form.trip)
    if (!trip || !form.title) return
    setSaving(true)
    const day =
      trip.start_date && form.date
        ? Math.round((new Date(form.date) - new Date(trip.start_date)) / 86400000) + 1
        : null
    const { error } = await supabase.from('journal_entries').insert({
      trip_id: trip.id,
      entry_date: form.date,
      day_number: day && day > 0 ? day : null,
      city: form.city || null,
      title: form.title,
      note: form.note || null,
      mood: form.mood,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
    })
    setSaving(false)
    if (!error) {
      setShow(false)
      setForm((f) => ({ ...f, city: '', title: '', note: '', tags: '' }))
      onSaved()
    } else {
      alert(`Couldn't save: ${error.message}`)
    }
  }

  if (!show) {
    return (
      <button className="journal-add-btn" onClick={() => setShow(true)}>
        + new entry
      </button>
    )
  }

  return (
    <div className="journal-form">
      <div className="jf-row">
        <select value={form.trip} onChange={set('trip')}>
          {tripMeta.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.title}
            </option>
          ))}
        </select>
        <input type="date" value={form.date} onChange={set('date')} />
      </div>
      <div className="jf-row">
        <input placeholder="City" value={form.city} onChange={set('city')} />
        <input placeholder="Title" value={form.title} onChange={set('title')} />
      </div>
      <textarea placeholder="What happened…" rows={4} value={form.note} onChange={set('note')} />
      <div className="jf-moods">
        {MOODS.map((m) => (
          <button
            key={m}
            className={`jf-mood${form.mood === m ? ' active' : ''}`}
            onClick={() => setForm((f) => ({ ...f, mood: m }))}
          >
            {m}
          </button>
        ))}
      </div>
      <input placeholder="tags, comma, separated" value={form.tags} onChange={set('tags')} />
      <div className="jf-actions">
        <button className="jf-cancel" onClick={() => setShow(false)}>
          cancel
        </button>
        <button className="jf-save" disabled={saving || !form.title} onClick={save}>
          {saving ? 'saving…' : 'save entry'}
        </button>
      </div>
    </div>
  )
}

export default function JournalTab() {
  const { tripMeta, selectedTrip, journalJump, clearJournalJump } = useContext(TripContext)
  const [entries, setEntries] = useState(null)
  const [reload, setReload] = useState(0)
  const [scrubJump, setScrubJump] = useState(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('journal_entries')
      .select('*')
      .order('entry_date', { ascending: true })
      .then(({ data }) => alive && setEntries(data ?? []))
    return () => {
      alive = false
    }
  }, [reload])

  const tripsById = useMemo(() => new Map(tripMeta.map((t) => [t.id, t])), [tripMeta])

  // Deep-link target from a Map pin/run — matched once entries are in,
  // then cleared so it doesn't keep re-triggering on later re-renders.
  const jumpEntry =
    entries && journalJump
      ? entries.find(
          (e) => tripsById.get(e.trip_id)?.slug === journalJump.tripSlug && e.entry_date === journalJump.date
        )
      : null

  useEffect(() => {
    if (entries && journalJump) clearJournalJump()
  }, [entries, journalJump, clearJournalJump])

  if (!entries) return <div className="tab-loading">loading journal…</div>

  const visible = entries.filter(
    (e) => !selectedTrip || tripsById.get(e.trip_id)?.slug === selectedTrip
  )

  // Group by trip unless filtered
  const groups = []
  if (selectedTrip) {
    if (visible.length) groups.push({ trip: null, entries: visible })
  } else {
    const byTrip = new Map()
    for (const e of visible) {
      if (!byTrip.has(e.trip_id)) byTrip.set(e.trip_id, [])
      byTrip.get(e.trip_id).push(e)
    }
    for (const t of tripMeta) {
      if (byTrip.has(t.id)) groups.push({ trip: t, entries: byTrip.get(t.id) })
    }
  }

  const selectedTripId = selectedTrip ? tripMeta.find((t) => t.slug === selectedTrip)?.id : null

  return (
    <div className="journal-tab">
      <AddEntry tripMeta={tripMeta} selectedTrip={selectedTrip} onSaved={() => setReload((r) => r + 1)} />
      {selectedTripId && <TripSummary tripId={selectedTripId} hasEntries={visible.length > 0} />}
      {selectedTrip && (
        <DayScrubber entries={visible} onJump={(id) => setScrubJump({ id, key: Date.now() })} />
      )}
      {!groups.length && (
        <div className="placeholder">
          <div className="placeholder-code">journal</div>
          <div className="placeholder-note">No entries yet — add the first one above.</div>
        </div>
      )}
      {groups.map((g, i) => (
        <section key={g.trip?.slug ?? i} className="journal-group">
          {g.trip && (
            <div className="flight-section-head">
              <span className="fsh-title">
                {g.trip.countries?.join(' ')} {g.trip.title}
              </span>
              <span className="fsh-meta">{g.entries.length} days</span>
            </div>
          )}
          {g.entries.map((e) => (
            <Entry
              key={e.id}
              e={e}
              autoOpen={jumpEntry?.id === e.id}
              jumpKey={scrubJump?.id === e.id ? scrubJump.key : null}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
