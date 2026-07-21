import { useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'
import { thumb } from '../../lib/imgTransform.js'
import { KIND_META, tripDays, sortEvents, eventsForDay, fmtTime, fmtDayLong } from '../../lib/planItems.js'
import PlanFlightCard from './PlanFlightCard.jsx'

export function TimelineItem({ ev, onToggle, onEdit, onSaveDetail }) {
  if (ev.kind === 'flight') return <PlanFlightCard event={ev} onEditEvent={onEdit} onSaveDetail={onSaveDetail} />
  const meta = KIND_META[ev.kind] || KIND_META.other
  // A multi-night stay's thread starts here — the rail continues down
  // through every SpanRow beneath it, so the whole stay reads as one
  // connected block rather than a card that goes quiet until checkout.
  const continues = ev.kind === 'hotel' && ev.end_date && ev.end_date !== ev.event_date
  return (
    <div className={`tl-item${ev.done ? ' done' : ''}`}>
      <button
        className={`tl-check${continues ? ' continues' : ''}`}
        style={{ borderColor: meta.color, color: ev.done ? '#fff' : meta.color, background: ev.done ? meta.color : 'transparent' }}
        onClick={onToggle}
      >
        {ev.done ? '✓' : meta.icon}
      </button>
      <button className="tl-card" onClick={onEdit}>
        <span className="tl-body">
          {ev.start_time && <span className="tl-time">{fmtTime(ev.start_time)}</span>}
          <span className="tl-title">{ev.title}</span>
          {ev.city && <span className="tl-city">{ev.city}</span>}
          {ev.note && <span className="tl-note">{ev.note}</span>}
          {ev.end_date && ev.end_date !== ev.event_date && (
            <span className="tl-range">
              until {new Date(ev.end_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </span>
        {ev.photo_url && (
          <span className="tl-photo">
            <img src={thumb(ev.photo_url, { width: 150, height: 150 })} alt="" loading="lazy" />
          </span>
        )}
      </button>
    </div>
  )
}

// A multi-night stay's full card only makes sense on check-in day — this
// is the lighter reminder that shows on every day in between (and on
// checkout day), so a 4-night Airbnb doesn't just vanish from the timeline
// after day one.
export function SpanRow({ ev, onEdit, dayKey }) {
  const meta = KIND_META[ev.kind] || KIND_META.other
  const isCheckout = ev.end_date === dayKey
  return (
    <button
      className={`tl-span${isCheckout ? ' tl-span-end' : ''}`}
      style={{ borderColor: meta.color, color: meta.color }}
      onClick={onEdit}
    >
      <span className="tl-span-i">{meta.icon}</span>
      <span className="tl-span-label">
        {isCheckout ? 'Check out — ' : 'Staying at '}
        {ev.city || ev.title}
      </span>
    </button>
  )
}

export default function ItineraryView({ trip, events, activeDay, setActiveDay, scrollSignal, onEventsChange, onAddOnDay, onEditEvent }) {
  const scrollRef = useRef(null)
  const sectionRefs = useRef({})
  const suppressSpy = useRef(false)

  const days = tripDays(trip.start_date, trip.end_date)
  const byDay = {}
  for (const ev of events) {
    const k = ev.event_date || 'unscheduled'
    ;(byDay[k] = byDay[k] || []).push(ev)
  }

  // Scroll to the active day when the switcher (or calendar) commands it.
  useEffect(() => {
    if (scrollSignal == null) return
    const el = sectionRefs.current[activeDay]
    const scroller = scrollRef.current
    if (el && scroller) {
      suppressSpy.current = true
      scroller.scrollTo({ top: el.offsetTop - scroller.offsetTop - 6, behavior: 'smooth' })
      setTimeout(() => (suppressSpy.current = false), 600)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollSignal])

  // Scrollspy: as the timeline scrolls, highlight whichever day is at the top.
  function onScroll() {
    if (suppressSpy.current) return
    const scroller = scrollRef.current
    if (!scroller) return
    const top = scroller.scrollTop + 12
    let current = days[0]?.key
    for (const d of days) {
      const el = sectionRefs.current[d.key]
      if (el && el.offsetTop - scroller.offsetTop <= top) current = d.key
    }
    if (current && current !== activeDay) setActiveDay(current)
  }

  async function toggleDone(ev) {
    const { error } = await supabase.from('planned_events').update({ done: !ev.done }).eq('id', ev.id)
    if (!error) onEventsChange(events.map((e) => (e.id === ev.id ? { ...e, done: !e.done } : e)))
  }

  function saveDetail(id, detail) {
    onEventsChange(events.map((e) => (e.id === id ? { ...e, detail } : e)))
  }

  const unscheduled = byDay.unscheduled ? sortEvents(byDay.unscheduled) : []

  return (
    <div className="tl-scroll" ref={scrollRef} onScroll={onScroll}>
      {days.map((d, i) => {
        const { starting, spanning } = eventsForDay(events, d.key)
        return (
          <section key={d.key} className="tl-day" ref={(el) => (sectionRefs.current[d.key] = el)}>
            <div className="tl-day-head">
              <span className="tl-day-num">Day {d.dayNum}</span>
              <span className="tl-day-date">{fmtDayLong(d.key)}</span>
            </div>
            {i === 0 && !starting.length && !spanning.length && (
              <div className="tl-day-empty">Trip starts here — add your outbound flight.</div>
            )}
            {starting.map((ev) => (
              <TimelineItem key={ev.id} ev={ev} onToggle={() => toggleDone(ev)} onEdit={() => onEditEvent(ev)} onSaveDetail={saveDetail} />
            ))}
            {spanning.map((ev) => (
              <SpanRow key={ev.id} ev={ev} dayKey={d.key} onEdit={() => onEditEvent(ev)} />
            ))}
            <button className="tl-add" onClick={() => onAddOnDay(d.key)}>
              + add to this day
            </button>
          </section>
        )
      })}

      {unscheduled.length > 0 && (
        <section className="tl-day">
          <div className="tl-day-head">
            <span className="tl-day-num">Unscheduled</span>
            <span className="tl-day-date">no date yet</span>
          </div>
          {unscheduled.map((ev) => (
            <TimelineItem key={ev.id} ev={ev} onToggle={() => toggleDone(ev)} onEdit={() => onEditEvent(ev)} />
          ))}
        </section>
      )}
    </div>
  )
}
