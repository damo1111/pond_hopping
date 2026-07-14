import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import CountryFlags from '../components/CountryFlags.jsx'
import PlanChat from '../components/PlanChat.jsx'
import { thumb } from '../lib/imgTransform.js'

const WISHLIST_STATUS = [
  { id: 'idea', label: 'Idea' },
  { id: 'planned', label: 'Planned' },
  { id: 'done', label: 'Done' },
]

function slugify(title) {
  return (
    (title || 'trip')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Date.now().toString(36)
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
        continue planning →
      </button>
    </div>
  )
}

// Wikipedia's REST summary API is free, keyless, and CORS-enabled — a
// plain client-side fetch. Firing it off the title field is a lightweight
// stand-in for "ask questions and use what I typed": type "Samoa" and the
// wishlist card gets a real photo (and a one-line description if you
// haven't written your own note), fully automatic — no image URL to fill in.
async function fetchPlaceInfo(title) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.trim())}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.type === 'disambiguation') return null
    return {
      image: data.thumbnail?.source || data.originalimage?.source || null,
      extract: data.extract || null,
    }
  } catch {
    return null
  }
}

function WishlistForm({ onAdded }) {
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [autoFound, setAutoFound] = useState(false)
  const [form, setForm] = useState({ title: '', country: '', image_url: '', notes: '' })
  const lookupTimer = useRef(null)

  function onTitleChange(e) {
    const title = e.target.value
    setForm((f) => ({ ...f, title }))
    setAutoFound(false)
    clearTimeout(lookupTimer.current)
    if (!title.trim()) return
    lookupTimer.current = setTimeout(async () => {
      setLookingUp(true)
      const info = await fetchPlaceInfo(title)
      setLookingUp(false)
      if (!info) return
      setForm((f) => ({ ...f, image_url: info.image || f.image_url, notes: f.notes || info.extract?.slice(0, 200) || f.notes }))
      if (info.image) setAutoFound(true)
    }, 700)
  }

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
    setAutoFound(false)
    setShow(false)
    onAdded()
  }

  if (!show) {
    return (
      <button className="plan-add-btn" onClick={() => setShow(true)}>
        + add to wishlist
      </button>
    )
  }

  return (
    <form className="plan-card" onSubmit={save}>
      <div className="plan-card-title">Someday…</div>
      <input className="plan-input" placeholder="Place or experience — a country or city is enough" required value={form.title} onChange={onTitleChange} />
      {lookingUp && <div className="plan-input-hint">finding a photo…</div>}
      {autoFound && !lookingUp && <div className="plan-input-hint">found a photo automatically.</div>}
      <input className="plan-input" placeholder="Country (optional)" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
      <textarea className="plan-input" rows={2} placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      <div className="plan-form-actions">
        <button className="plan-btn ghost" type="button" onClick={() => setShow(false)}>
          Cancel
        </button>
        <button className="plan-btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
    </form>
  )
}

function WishlistItem({ item, onChange, onOpenChat }) {
  const [converting, setConverting] = useState(false)

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

  async function turnIntoTrip() {
    if (item.trip_id) {
      onOpenChat(item.trip_id)
      return
    }
    setConverting(true)
    const { data: trip, error } = await supabase
      .from('trips')
      .insert({
        slug: slugify(item.title),
        title: item.title,
        subtitle: item.notes || null,
        countries: [],
        status: 'draft',
        sort_order: 0,
      })
      .select('id')
      .single()
    if (!error && trip) {
      if (item.image_url) {
        await supabase.from('photo_cache').upsert({ trip_id: trip.id, urls: [item.image_url], status: 'ok', updated_at: new Date().toISOString() })
      }
      await supabase.from('wishlist_items').update({ trip_id: trip.id, status: 'planned' }).eq('id', item.id)
      onChange()
      onOpenChat(trip.id)
    }
    setConverting(false)
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
        <button className="wishlist-convert" onClick={turnIntoTrip} disabled={converting}>
          {converting ? 'creating…' : item.trip_id ? '→ continue this trip' : '→ turn into a trip'}
        </button>
      </div>
    </div>
  )
}

export default function PlanTab() {
  const [draftTrips, setDraftTrips] = useState(null)
  const [plannedEvents, setPlannedEvents] = useState([])
  const [wishlist, setWishlist] = useState(null)
  const [chat, setChat] = useState(null) // null = closed, { tripId, mode } otherwise

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
          <button className="plan-add-btn" onClick={() => setChat({ tripId: null, mode: 'chat' })}>
            + plan a trip
          </button>
        </div>
        {draftTrips.length === 0 && (
          <div className="plan-empty">Nothing being planned right now — start one above, free-text or a quick form, whichever you'd rather.</div>
        )}
        <div className="plan-trip-list">
          {draftTrips.map((t) => (
            <DraftTripCard
              key={t.id}
              t={t}
              events={plannedEvents.filter((e) => e.trip_id === t.id)}
              onOpen={() => setChat({ tripId: t.id, mode: 'itinerary' })}
              onChat={() => setChat({ tripId: t.id, mode: 'chat' })}
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
            <WishlistItem
              key={item.id}
              item={item}
              onChange={() => {
                loadWishlist()
                loadDrafts()
              }}
              onOpenChat={(tripId) => setChat({ tripId, mode: 'itinerary' })}
            />
          ))}
        </div>
      </section>

      {chat && (
        <PlanChat
          tripId={chat.tripId}
          initialMode={chat.mode}
          onClose={() => setChat(null)}
          onChanged={() => {
            loadDrafts()
            loadWishlist()
          }}
        />
      )}
    </div>
  )
}
