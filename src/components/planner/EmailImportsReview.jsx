import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../lib/AuthContext.jsx'
import { KIND_META } from '../../lib/planItems.js'

// Reviews one pending email_imports row: confirm which trip it belongs to
// (pre-matched by date against trips the *forwarder* is a member of, but
// always changeable), tick which extracted items to keep, then write them
// into planned_events exactly like the paste-a-booking flow does.
//
// Deliberately never pre-selects an arbitrary trip. It used to fall back to
// the first draft in the list, which meant a Melbourne hotel in August
// defaulted to a UK trip in September with a one-tap button offering to
// merge it — a fast route to a corrupted itinerary. If nothing matched, the
// honest answer is "I don't know", and the natural next move is usually to
// start a new trip.
const CREATE = '__create__'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function slugify(s) {
  return (
    (s || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') +
    '-' + Date.now().toString(36)
  )
}

// One hotel booking gives you a city and a date. "Melbourne · Aug 2026" is
// honest and editable; anything cleverer risks being confidently wrong.
function proposeTrip(items) {
  const dates = items.map((i) => i.event_date).filter(Boolean).sort()
  const ends = items.map((i) => i.end_date || i.event_date).filter(Boolean).sort()
  const start = dates[0] || null
  const end = ends[ends.length - 1] || start
  const city = items.find((i) => i.city)?.city
  const label = start
    ? new Date(start + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : ''
  return { title: [city, label].filter(Boolean).join(' · ') || 'New trip', start, end }
}

// Whose leg is this? Deliberately cautious, because the name on a booking
// says almost nothing about who is travelling: one partner routinely books
// in their own name for a loyalty discount, sometimes for a trip they
// aren't even on. So a name only attributes a leg when it identifies
// exactly one member *and* the booking is for one person.
//
// Otherwise it stays null, which resolves to the trip's *travellers*
// (trip_members.is_traveller) — not its members. That distinction is the
// whole point: David plans and books Seeby's September UK trip without
// going on it, so null there means Seeby, not both of them.
function attributeTo(item, members) {
  if (!item.travelers?.length) return null
  if ((item.party_size ?? 1) > 1) return null

  const tokens = (s) => String(s || '').toLowerCase().match(/[a-z]{3,}/g) || []
  const printed = new Set(item.travelers.flatMap(tokens))

  const hits = members.filter((m) =>
    [...tokens(m.display_name), ...tokens(m.email.split('@')[0])].some((t) => printed.has(t))
  )
  return hits.length === 1 ? hits[0].display_name || null : null
}

export default function EmailImportsReview({ imports, draftTrips, onClose, onChanged }) {
  const { user, profile } = useAuth()
  const [index, setIndex] = useState(0)
  const [keep, setKeep] = useState(() =>
    Object.fromEntries((imports[0]?.items || []).map((_, i) => [i, true]))
  )
  // Only ever the real match, or nothing.
  const [tripId, setTripId] = useState(imports[0]?.matched_trip_id || null)
  // Who's actually going on a trip we're about to create: 'both' | 'me' | 'them'.
  const [going, setGoing] = useState('both')
  const [allTrips, setAllTrips] = useState([])
  const [saving, setSaving] = useState(false)

  // Offer every trip they can edit, not just drafts — a forwarded booking
  // often belongs to a confirmed trip that's already underway.
  useEffect(() => {
    supabase
      .from('trips')
      .select('id,slug,title,start_date,end_date')
      .order('start_date', { ascending: false, nullsFirst: false })
      .then(({ data }) => setAllTrips(data ?? draftTrips ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = imports[index]
  if (!current) return null

  const proposal = proposeTrip(current.items || [])
  const selected = allTrips.find((t) => t.id === tripId)

  // If they pick a trip whose window doesn't contain these dates, say so
  // rather than silently allowing exactly the mistake described above.
  const outOfRange =
    selected?.start_date && selected?.end_date &&
    (current.items || []).some(
      (i) => i.event_date && (i.event_date < selected.start_date || i.event_date > selected.end_date)
    )

  function goNext() {
    const next = imports[index + 1]
    if (!next) return onClose()
    setIndex(index + 1)
    setKeep(Object.fromEntries((next.items || []).map((_, i) => [i, true])))
    setTripId(next.matched_trip_id || null)
  }

  async function dismiss() {
    await supabase.from('email_imports').update({ status: 'dismissed' }).eq('id', current.id)
    onChanged()
    goNext()
  }

  // A mutual partner link is itself a declaration that these two travel
  // together, so a brand-new trip from either of them starts shared. Without
  // one, it starts solo — adding a trip to someone else's app uninvited is
  // far worse than making them tap "share".
  //
  // Membership is not the same as presence, though: people routinely book
  // and plan trips they aren't on. `going` says who is actually travelling;
  // both stay members either way, so whoever booked it keeps full access to
  // what they arranged.
  async function createTrip() {
    const { data: trip } = await supabase
      .from('trips')
      .insert({
        slug: slugify(proposal.title),
        title: proposal.title,
        start_date: proposal.start,
        end_date: proposal.end,
        countries: [],
        status: 'draft',
        sort_order: 0,
      })
      .select('id')
      .single()
    if (!trip) return null

    const partner = profile?.partner_email
    const members = [
      {
        trip_id: trip.id,
        email: user.email,
        role: 'owner',
        display_name: profile?.display_name || user.email.split('@')[0],
        is_traveller: going !== 'them',
      },
    ]
    if (partner) {
      members.push({
        trip_id: trip.id,
        email: partner,
        role: 'planner',
        display_name: partner.split('@')[0],
        is_traveller: going !== 'me',
      })
    }
    await supabase.from('trip_members').insert(members)
    return trip.id
  }

  async function save() {
    setSaving(true)
    const target = tripId === CREATE ? await createTrip() : tripId
    if (!target) {
      setSaving(false)
      return
    }

    const { data: members } = await supabase
      .from('trip_members')
      .select('email,display_name')
      .eq('trip_id', target)

    const rows = current.items
      .filter((_, i) => keep[i])
      .map((it) => ({
        trip_id: target,
        traveler: attributeTo(it, members ?? []),
        event_date: it.event_date,
        end_date: it.end_date || null,
        start_time: it.start_time || null,
        title: it.title,
        city: it.city || null,
        kind: it.kind,
        note: it.note ? `${it.note} · imported` : 'imported from a forwarded email',
        detail: { imported: true, source_subject: it.source_subject },
        done: false,
      }))
    if (rows.length) await supabase.from('planned_events').insert(rows)

    // An existing trip should grow to fit a booking that falls outside it,
    // rather than the booking sitting invisibly beyond the trip's own dates.
    if (tripId !== CREATE && selected) {
      const patch = {}
      if (proposal.start && (!selected.start_date || proposal.start < selected.start_date)) patch.start_date = proposal.start
      if (proposal.end && (!selected.end_date || proposal.end > selected.end_date)) patch.end_date = proposal.end
      if (Object.keys(patch).length) await supabase.from('trips').update(patch).eq('id', target)
    }

    await supabase.from('email_imports').update({ status: 'reviewed', matched_trip_id: target }).eq('id', current.id)
    setSaving(false)
    onChanged()
    goNext()
  }

  const keepCount = Object.values(keep).filter(Boolean).length
  const chosen = tripId === CREATE ? proposal.title : selected?.title
  const canSave = keepCount > 0 && !!tripId && !saving

  return (
    <div className="ios-sheet-overlay" onClick={onClose}>
      <div className="ios-sheet gm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ios-sheet-grip" />
        <div className="ios-sheet-title">📧 From {current.from_address || 'an email'}</div>
        <div className="ios-sheet-sub">
          {current.subject ? `"${current.subject}" — ` : ''}
          found {current.items.length}. {imports.length > 1 ? `${index + 1} of ${imports.length}.` : ''}
        </div>

        <select className="account-input" value={tripId || ''} onChange={(e) => setTripId(e.target.value || null)}>
          <option value="">Which trip?</option>
          <option value={CREATE}>＋ New trip — {proposal.title}</option>
          {allTrips.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>

        {!current.matched_trip_id && !tripId && (
          <div className="ios-sheet-sub">
            Nothing on your existing trips covers these dates — starting a new one is probably right.
          </div>
        )}

        {/* Only when creating. For an existing trip the travellers are
            already established, and quietly rewriting them from one
            forwarded booking would be the wrong call. */}
        {tripId === CREATE && profile?.partner_email && (
          <>
            <div className="ios-sheet-sub">Who's actually going?</div>
            <div className="going-row">
              {[
                { id: 'both', label: 'Both of us' },
                { id: 'me', label: 'Just me' },
                { id: 'them', label: `Just ${profile.partner_email.split('@')[0]}` },
              ].map((o) => (
                <button
                  key={o.id}
                  className={`going-opt${going === o.id ? ' on' : ''}`}
                  onClick={() => setGoing(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {going === 'them' && (
              <div className="ios-sheet-sub">
                You'll still be able to see and plan it — you just won't be counted as travelling.
              </div>
            )}
          </>
        )}

        {outOfRange && (
          <div className="gm-warn">
            ⚠️ These dates fall outside {selected.title} ({fmtDate(selected.start_date)} – {fmtDate(selected.end_date)}).
            Adding them will extend that trip.
          </div>
        )}

        <div className="gm-list">
          {current.items.map((it, i) => {
            const meta = KIND_META[it.kind] || KIND_META.other
            const shaky = (it.confidence ?? 1) < 0.7
            return (
              <button key={i} className={`gm-item${keep[i] ? ' on' : ''}`} onClick={() => setKeep((k) => ({ ...k, [i]: !k[i] }))}>
                <span className="gm-check" style={keep[i] ? { background: meta.color, borderColor: meta.color } : undefined}>
                  {keep[i] ? '✓' : ''}
                </span>
                <span className="gm-item-i" style={{ color: meta.color }}>{meta.icon}</span>
                <span className="gm-item-body">
                  <span className="gm-item-title">{it.title}</span>
                  <span className="gm-item-sub">
                    {fmtDate(it.event_date)}
                    {it.end_date && it.end_date !== it.event_date ? ` – ${fmtDate(it.end_date)}` : ''}
                    {it.city ? ` · ${it.city}` : ''}
                    {shaky ? ' · not sure' : ''}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <button className="ios-sheet-done" onClick={save} disabled={!canSave}>
          {saving
            ? 'Adding…'
            : !tripId
              ? 'Choose a trip first'
              : `Add ${keepCount} to ${chosen}`}
        </button>
        <button className="account-btn ghost" onClick={dismiss}>Not a real booking — dismiss</button>
        <button className="account-btn ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
