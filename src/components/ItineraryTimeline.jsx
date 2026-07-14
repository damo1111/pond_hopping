import { supabase } from '../lib/supabase.js'
import { thumb } from '../lib/imgTransform.js'

// Category colour/icon instead of leaning on the app's gold accent for
// every row — matches the established pattern of colour-coding by kind
// (CostsTab's CAT_ICON, tripColors.js's per-trip palette) rather than
// introducing a new one-size-fits-all treatment.
export const KIND_META = {
  flight: { icon: '✈️', color: '#3B7EA1' },
  hotel: { icon: '🏨', color: '#C97B95' },
  transport: { icon: '🚆', color: '#3E7D54' },
  activity: { icon: '🎟️', color: '#C17817' },
  other: { icon: '📍', color: '#8B8375' },
}

function fmtDate(iso) {
  if (!iso) return 'no date yet'
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function ItineraryTimeline({ events, onEventsChange }) {
  const sorted = [...events].sort((a, b) => (a.event_date || '9999').localeCompare(b.event_date || '9999'))

  async function toggleDone(ev) {
    const { error } = await supabase.from('planned_events').update({ done: !ev.done }).eq('id', ev.id)
    if (!error) onEventsChange(events.map((e) => (e.id === ev.id ? { ...e, done: !e.done } : e)))
  }

  if (!sorted.length) {
    return <div className="itinerary-empty">Nothing planned yet — switch to chat and tell the planner what you've got.</div>
  }

  return (
    <div className="itinerary-timeline">
      {sorted.map((ev) => {
        const meta = KIND_META[ev.kind] || KIND_META.other
        return (
          <button key={ev.id} className={`itinerary-row${ev.done ? ' done' : ''}`} onClick={() => toggleDone(ev)}>
            <span className="itinerary-rail">
              <span className="itinerary-dot" style={{ background: meta.color }}>
                {ev.done ? '✓' : meta.icon}
              </span>
              <span className="itinerary-line" />
            </span>
            <span className="itinerary-card">
              {ev.photo_url && (
                <span className="itinerary-photo">
                  <img src={thumb(ev.photo_url, { width: 120, height: 120 })} alt="" loading="lazy" />
                </span>
              )}
              <span className="itinerary-body">
                <span className="itinerary-date">{fmtDate(ev.event_date)}</span>
                <span className="itinerary-title">{ev.title}</span>
                {ev.city && <span className="itinerary-city">{ev.city}</span>}
                {ev.note && <span className="itinerary-note">{ev.note}</span>}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
