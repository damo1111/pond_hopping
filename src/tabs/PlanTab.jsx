import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import CountryFlags from '../components/CountryFlags.jsx'
import PlanningModal from '../components/PlanningModal.jsx'
import PlanChat from '../components/PlanChat.jsx'
import { thumb } from '../lib/imgTransform.js'

const WISHLIST_STATUS = [
  { id: 'idea', label: 'Idea' },
  { id: 'planned', label: 'Planned' },
  { id: 'done', label: 'Done' },
]

function slugify(title) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Date.now().toString(36)
  )
}

function NewTripForm({ onCreated }) {
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ title: '', subtitle: '', traveler: '', start_date: '', end_date: '' })

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('trips').insert({
      slug: slugify(form.title || 'trip'),
      title: form.title,
      subtitle: form.subtitle || null,
      traveler: form.traveler || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      countries: [],
      status: 'draft',
      sort_order: 0,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm({ title: '', subtitle: '', traveler: '', start_date: '', end_date: '' })
    setShow(false)
    onCreated()
  }

  if (!show) {
    return (
      <button className="plan-btn" onClick={() => setShow(true)}>
        + New trip
      </button>
    )
  }

  return (
    <form className="plan-card" onSubmit={save}>
      <div className="plan-card-title">New trip</div>
      <input
        className="plan-input"
        placeholder="Title (e.g. UK, or Japan ski trip)"
        required
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
      />
      <input
        className="plan-input"
        placeholder="Subtitle / notes (optional)"
        value={form.subtitle}
        onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
      />
      <input
        className="plan-input"
        placeholder="Whose trip? (leave blank if it's yours)"
        value={form.traveler}
        onChange={(e) => setForm((f) => ({ ...f, traveler: e.target.value }))}
      />
      <div className="plan-input-row">
        <input
          className="plan-input"
          type="date"
          value={form.start_date}
          onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
        />
        <input
          className="plan-input"
          type="date"
          value={form.end_date}
          onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
        />
      </div>
      <div className="plan-input-hint">Dates can be rough guesses — nothing here needs to be locked in yet.</div>
      <div className="plan-form-actions">
        <button className="plan-btn" type="submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create draft'}
        </button>
        <button className="plan-btn ghost" type="button" onClick={() => setShow(false)}>
          Cancel
        </button>
      </div>
      {error && <div className="plan-error">{error}</div>}
    </form>
  )
}

function DraftTripCard({ t, events, onOpen, onChat }) {
  const doneCount = events.filter((e) => e.done).length
  return (
    <div className="plan-trip-card">
      <button className="plan-trip-card-main" onClick={onOpen}>
        <div className="plan-trip-top">
          <CountryFlags countries={t.countries} size={18} />
          <span className="plan-trip-badge">✏️ Planning{t.traveler ? ` · ${t.traveler}` : ''}</span>
        </div>
        <div className="plan-trip-title">{t.title}</div>
        {t.subtitle && <div className="plan-trip-subtitle">{t.subtitle}</div>}
        <div className="plan-trip-stats">
          {t.start_date ? `~${new Date(t.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'dates tbc'}
          {t.end_date ? ` – ${new Date(t.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
          {' · '}
          {events.length ? `${doneCount}/${events.length} planned` : 'nothing logged yet'}
        </div>
      </button>
      <button
        className="plan-trip-card-chat"
        onClick={(e) => {
          e.stopPropagation()
          onChat()
        }}
      >
        💬 Continue with AI
      </button>
    </div>
  )
}

function WishlistForm({ onAdded }) {
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', country: '', image_url: '', notes: '' })

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('wishlist_items').insert({
      title: form.title,
      country: form.country || null,
      image_url: form.image_url || null,
      notes: form.notes || null,
      status: 'idea',
    })
    setSaving(false)
    setForm({ title: '', country: '', image_url: '', notes: '' })
    setShow(false)
    onAdded()
  }

  if (!show) {
    return (
      <button className="plan-btn ghost" onClick={() => setShow(true)}>
        + Add to wishlist
      </button>
    )
  }

  return (
    <form className="plan-card" onSubmit={save}>
      <div className="plan-card-title">Someday…</div>
      <input
        className="plan-input"
        placeholder="Place or experience"
        required
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
      />
      <input
        className="plan-input"
        placeholder="Country (optional)"
        value={form.country}
        onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
      />
      <input
        className="plan-input"
        placeholder="Image URL (optional)"
        value={form.image_url}
        onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
      />
      <textarea
        className="plan-input"
        rows={2}
        placeholder="Notes (optional)"
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
      />
      <div className="plan-form-actions">
        <button className="plan-btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add'}
        </button>
        <button className="plan-btn ghost" type="button" onClick={() => setShow(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function WishlistItem({ item, onChange }) {
  async function cycleStatus() {
    const idx = WISHLIST_STATUS.findIndex((s) => s.id === item.status)
    const next = WISHLIST_STATUS[(idx + 1) % WISHLIST_STATUS.length].id
    await supabase.from('wishlist_items').update({ status: next }).eq('id', item.id)
    onChange()
  }
  async function remove() {
    await supabase.from('wishlist_items').delete().eq('id', item.id)
    onChange()
  }

  return (
    <div className="wishlist-card">
      {item.image_url ? (
        <div className="wishlist-cover">
          <img src={thumb(item.image_url, { width: 300, height: 180 })} alt="" loading="lazy" />
        </div>
      ) : (
        <div className="wishlist-cover wishlist-cover-empty">🌍</div>
      )}
      <div className="wishlist-body">
        <div className="wishlist-title">{item.title}</div>
        {item.country && <div className="wishlist-country">{item.country}</div>}
        {item.notes && <div className="wishlist-notes">{item.notes}</div>}
        <div className="wishlist-actions">
          <button className={`wishlist-status wishlist-status-${item.status}`} onClick={cycleStatus}>
            {WISHLIST_STATUS.find((s) => s.id === item.status)?.label || item.status}
          </button>
          <button className="wishlist-remove" onClick={remove}>
            remove
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PlanTab() {
  const [draftTrips, setDraftTrips] = useState(null)
  const [plannedEvents, setPlannedEvents] = useState([])
  const [openDraft, setOpenDraft] = useState(null)
  const [wishlist, setWishlist] = useState(null)
  const [chatTripId, setChatTripId] = useState(undefined) // undefined = closed, null = new trip, string = continuing a draft

  function loadDrafts() {
    supabase
      .from('trips')
      .select('id,slug,title,subtitle,start_date,end_date,countries,sort_order,traveler')
      .eq('status', 'draft')
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setDraftTrips(data ?? [])
        if (data?.length) {
          supabase
            .from('planned_events')
            .select('*')
            .in('trip_id', data.map((t) => t.id))
            .then(({ data: events }) => setPlannedEvents(events ?? []))
        } else {
          setPlannedEvents([])
        }
      })
  }

  function loadWishlist() {
    supabase
      .from('wishlist_items')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setWishlist(data ?? []))
  }

  useEffect(() => {
    loadDrafts()
    loadWishlist()
  }, [])

  if (!draftTrips || !wishlist) return <div className="tab-loading">loading plans…</div>

  return (
    <div className="plan-tab">
      <section className="plan-section">
        <div className="plan-section-head">
          <div className="plan-section-title">Trips in the works</div>
          <div className="plan-section-actions">
            <button className="plan-btn" onClick={() => setChatTripId(null)}>
              ✨ Plan with AI
            </button>
            <NewTripForm onCreated={loadDrafts} />
          </div>
        </div>
        {draftTrips.length === 0 && (
          <div className="plan-empty">Nothing being planned right now — start one above, or just tell the AI planner what you're thinking.</div>
        )}
        <div className="plan-trip-list">
          {draftTrips.map((t) => (
            <DraftTripCard
              key={t.id}
              t={t}
              events={plannedEvents.filter((e) => e.trip_id === t.id)}
              onOpen={() => setOpenDraft(t)}
              onChat={() => setChatTripId(t.id)}
            />
          ))}
        </div>
      </section>

      <section className="plan-section">
        <div className="plan-section-head">
          <div className="plan-section-title">Wishlist</div>
          <WishlistForm onAdded={loadWishlist} />
        </div>
        {wishlist.length === 0 && <div className="plan-empty">Nowhere on the someday-list yet.</div>}
        <div className="wishlist-grid">
          {wishlist.map((item) => (
            <WishlistItem key={item.id} item={item} onChange={loadWishlist} />
          ))}
        </div>
      </section>

      {openDraft && (
        <PlanningModal
          trip={openDraft}
          events={plannedEvents.filter((e) => e.trip_id === openDraft.id)}
          onClose={() => setOpenDraft(null)}
          onEventsChange={(updated) =>
            setPlannedEvents((all) => [...all.filter((e) => e.trip_id !== openDraft.id), ...updated])
          }
        />
      )}

      {chatTripId !== undefined && (
        <PlanChat
          tripId={chatTripId}
          onClose={() => setChatTripId(undefined)}
          onChanged={loadDrafts}
        />
      )}
    </div>
  )
}
