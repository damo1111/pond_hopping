import { useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { TripContext } from '../App.jsx'
import { useAuth } from '../lib/AuthContext.jsx'
import CountryFlags from '../components/CountryFlags.jsx'
import PlanChat from '../components/PlanChat.jsx'
import TripPlanner from '../components/TripPlanner.jsx'
import EmailImportsReview from '../components/planner/EmailImportsReview.jsx'
import Icon from '../components/Icon.jsx'
import PlanCard from '../components/plan/PlanCard.jsx'
import { planLane } from '../lib/planLane.js'
import { neverBeen } from '../lib/neverBeen.js'

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
      <button className="plan-add-idea" onClick={() => setShow(true)}>
        + Add an idea
      </button>
    )
  }

  return (
    <form className="plan-wish-form" onSubmit={save}>
      <div className="plan-wish-form-title">Someday…</div>
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


// A member-gated trip carries its ownership on the card. Full display name,
// not first name — in a two-David household, "David's trip" identifies nobody.
function whoseTrip(members, myEmail) {
  const owner = members?.find((m) => m.role === 'owner')
  if (!owner) return null
  const mine = owner.email.toLowerCase() === (myEmail || '').toLowerCase()
  const me = myEmail ? members.find((m) => m.email.toLowerCase() === myEmail.toLowerCase()) : null
  const role = me && me.role !== 'owner' ? ` · you're the ${me.role}` : ''
  return `${mine ? 'Your' : `${owner.display_name || owner.email}'s`} trip${role}`
}

export default function PlanTab() {
  const { user } = useAuth()
  const [draftTrips, setDraftTrips] = useState(null)
  const [plannedEvents, setPlannedEvents] = useState([])
  const [covers, setCovers] = useState({})
  const [members, setMembers] = useState({}) // trip_id -> trip_members rows (RLS: only trips you belong to)
  const [wishlist, setWishlist] = useState(null)
  // Only for the empty state's suggestion: which corners of the world this
  // account has actually landed in. Coordinates only — nothing else is read.
  const [flownLegs, setFlownLegs] = useState([])
  const [creating, setCreating] = useState(false) // PlanChat for a brand-new trip
  const [plannerId, setPlannerId] = useState(null) // full-screen TripPlanner for an existing draft
  const { plannerJump, clearPlannerJump, openAuth } = useContext(TripContext)

  // Home hands over a trip id when one of its cards is tapped; PlanTab owns
  // the planner, so this is where that lands.
  useEffect(() => {
    if (!plannerJump?.id) return
    setPlannerId(plannerJump.id)
    clearPlannerJump()
  }, [plannerJump, clearPlannerJump])
  const [pendingImports, setPendingImports] = useState([])
  const [reviewingImports, setReviewingImports] = useState(false)

  function loadPendingImports() {
    supabase
      .from('email_imports')
      .select('*')
      .eq('status', 'pending')
      .order('received_at', { ascending: true })
      .then(({ data }) => setPendingImports(data ?? []))
  }

  function loadDrafts() {
    supabase
      .from('trips')
      .select('id,slug,title,subtitle,start_date,end_date,countries,sort_order,traveler')
      .eq('status', 'draft')
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setDraftTrips(data ?? [])
        if (data?.length) {
          const ids = data.map((t) => t.id)
          supabase
            .from('planned_events')
            .select('*')
            .in('trip_id', ids)
            .then(({ data: events }) => setPlannedEvents(events ?? []))
          supabase
            .from('photo_cache')
            .select('trip_id,urls')
            .in('trip_id', ids)
            .then(({ data: rows }) => setCovers(Object.fromEntries((rows ?? []).map((r) => [r.trip_id, r.urls?.[0]]).filter(([, u]) => u))))
          supabase
            .from('trip_members')
            .select('trip_id,email,role,display_name')
            .in('trip_id', ids)
            .then(({ data: rows }) => {
              const byTrip = {}
              for (const r of rows ?? []) (byTrip[r.trip_id] = byTrip[r.trip_id] || []).push(r)
              setMembers(byTrip)
            })
        } else {
          setPlannedEvents([])
          setCovers({})
          setMembers({})
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

  // Re-fetch when auth state changes — RLS returns a different world
  // depending on who (if anyone) is signed in.
  useEffect(() => {
    loadDrafts()
    loadWishlist()
    loadPendingImports()
    supabase
      .from('flights')
      .select('dep_lat,dep_lon,arr_lat,arr_lon')
      .eq('status', 'flown')
      .then(({ data }) => setFlownLegs(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // A someday turning into a trip is the lifecycle's first hinge, so it lives
  // on the card rather than behind a menu: tap the idea, get a planner.
  async function promote(item) {
    if (item.trip_id) return setPlannerId(item.trip_id)
    const { data: trip, error } = await supabase
      .from('trips')
      .insert({ slug: slugify(item.title), title: item.title, subtitle: item.notes || null,
        countries: [], status: 'draft', sort_order: 0 })
      .select('id')
      .single()
    if (error || !trip) return
    if (item.image_url) {
      await supabase.from('photo_cache').upsert({
        trip_id: trip.id, urls: [item.image_url], status: 'ok', updated_at: new Date().toISOString(),
      })
    }
    await supabase.from('wishlist_items').update({ trip_id: trip.id, status: 'planned' }).eq('id', item.id)
    loadWishlist()
    loadDrafts()
    setPlannerId(trip.id)
  }

  if (!draftTrips || !wishlist) return <div className="tab-loading">loading plans…</div>

  const lane = planLane({ trips: draftTrips, wishlist, events: plannedEvents })
  const suggestion = neverBeen(flownLegs)

  return (
    <div className="plan-tab">
      {pendingImports.length > 0 && (
        <button className="plan-import-banner" onClick={() => setReviewingImports(true)}>
          <Icon name="speech" size={15} />
          <span>{pendingImports.length} booking{pendingImports.length > 1 ? 's' : ''} from a forwarded email — review</span>
        </button>
      )}

      {/* One lane, not two sections. "Trips in the works" and "Wishlist" were
          the same spectrum split in half, each with its own heading and its
          own dashed button. Someday → Planning → Booked is the lifecycle the
          rest of the app already runs on. */}
      <header className="plan-head">
        <h1 className="plan-h1">What&apos;s next</h1>
        <button className="plan-new" onClick={() => (user ? setCreating(true) : openAuth())}>
          <Icon name="plus" size={15} />
          <span>Plan a trip</span>
        </button>
      </header>

      {/* This used to be a sentence pointing at another tab three taps away,
          which is not a prompt, it is a shrug. Sign-in is now a button, next
          to the reason you would want it. */}
      {!user && (
        <div className="plan-signin">
          <div className="plan-signin-body">
            This one&apos;s an example. Sign in to start your own.
          </div>
          <button className="plan-signin-btn" onClick={openAuth}>
            Sign in or create an account
          </button>
        </div>
      )}

      {lane.length === 0 ? (
        <div className="plan-blank">
          <div className="plan-blank-title">Nothing on the horizon.</div>
          {suggestion && (
            <p className="plan-blank-note">
              You&apos;ve landed in {suggestion.visited} of {suggestion.total} corners of the world. Never{' '}
              {suggestion.name}, though — {suggestion.prompt}.
            </p>
          )}
          <button className="plan-new plan-new-big" onClick={() => (user ? setCreating(true) : openAuth())}>
            <Icon name="plus" size={16} />
            <span>Start something</span>
          </button>
        </div>
      ) : (
        <div className="plan-lane">
          {lane.map((row, i) => (
            <PlanCard
              key={`${row.kind}-${row.id}`}
              row={row}
              index={i}
              cover={covers[row.id]}
              whose={row.kind === 'trip' ? whoseTrip(members[row.id], user?.email) : null}
              onOpen={() => (row.kind === 'trip' ? setPlannerId(row.id) : promote(row.wish))}
            />
          ))}
        </div>
      )}

      {/* An empty wishlist used to read "Nowhere on the someday-list yet",
          which is a dead end on a screen that is already mostly white. This is
          drawn from the reader's own flights — the one suggestion this app can
          make that nobody else could. */}
      {lane.length > 0 && wishlist.length === 0 && suggestion && (
        <button className="plan-suggest" onClick={() => (user ? setCreating(true) : openAuth())}>
          <span className="ps-eyebrow">Someday</span>
          <span className="ps-title">You&apos;ve never been to {suggestion.name}</span>
          <span className="ps-note">{suggestion.prompt}</span>
        </button>
      )}

      <div className="plan-foot">
        <WishlistForm onAdded={loadWishlist} />
      </div>

      {creating && (
        <PlanChat
          tripId={null}
          onClose={() => setCreating(false)}
          onChanged={() => {
            loadDrafts()
            loadWishlist()
          }}
        />
      )}

      {plannerId && (
        <TripPlanner
          tripId={plannerId}
          onClose={() => {
            setPlannerId(null)
            loadDrafts()
          }}
          onChanged={loadDrafts}
        />
      )}

      {reviewingImports && pendingImports.length > 0 && (
        <EmailImportsReview
          imports={pendingImports}
          draftTrips={draftTrips}
          onClose={() => setReviewingImports(false)}
          onChanged={() => {
            loadPendingImports()
            loadDrafts()
          }}
        />
      )}
    </div>
  )
}
