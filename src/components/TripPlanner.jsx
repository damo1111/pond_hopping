import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { tripDays } from '../lib/planItems.js'
import ItineraryView from './planner/ItineraryView.jsx'
import OverviewView from './planner/OverviewView.jsx'
import ExploreView from './planner/ExploreView.jsx'
import AddItemSheet from './planner/AddItemSheet.jsx'
import EditEventModal from './planner/EditEventModal.jsx'
import PlanChat from './PlanChat.jsx'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'explore', label: 'Explore' },
]

export default function TripPlanner({ tripId, onClose, onChanged }) {
  const [trip, setTrip] = useState(null)
  const [events, setEvents] = useState([])
  const [tab, setTab] = useState('itinerary')
  const [activeDay, setActiveDay] = useState(null)
  const [scrollSignal, setScrollSignal] = useState(null)
  const [showCal, setShowCal] = useState(false)
  const [addDay, setAddDay] = useState(undefined) // undefined = closed
  const [editEvent, setEditEvent] = useState(null)
  const [chat, setChat] = useState(null) // null | { autoSend }
  const daySwitchRef = useRef(null)

  function loadTrip() {
    supabase
      .from('trips')
      .select('id,slug,title,subtitle,traveler,start_date,end_date,countries,status')
      .eq('id', tripId)
      .single()
      .then(({ data }) => setTrip(data || null))
  }
  function loadEvents() {
    supabase
      .from('planned_events')
      .select('*')
      .eq('trip_id', tripId)
      .then(({ data }) => setEvents(data ?? []))
  }

  useEffect(() => {
    loadTrip()
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  const days = trip ? tripDays(trip.start_date, trip.end_date) : []

  useEffect(() => {
    if (!activeDay && days.length) setActiveDay(days[0].key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip])

  // Keep the active day chip in view as the timeline scrolls it.
  useEffect(() => {
    const el = daySwitchRef.current?.querySelector('.tp-day.active')
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeDay])

  function jumpToDay(key) {
    setActiveDay(key)
    setScrollSignal((s) => (s || 0) + 1)
    if (tab !== 'itinerary') setTab('itinerary')
    setShowCal(false)
  }

  function refreshAfterAI() {
    loadTrip()
    loadEvents()
    onChanged?.()
  }

  if (!trip) return <div className="tp-modal"><div className="tp-loading">loading trip…</div></div>

  const showDaySwitch = tab === 'itinerary' || tab === 'overview'

  return (
    <div className="tp-modal">
      <header className="tp-header">
        <button className="tp-back" onClick={onClose}>‹</button>
        <div className="tp-title">{trip.title}</div>
        <button className="tp-menu" onClick={() => setChat({ autoSend: null })}>✨</button>
      </header>

      <nav className="tp-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tp-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {showDaySwitch && days.length > 0 && (
        <div className="tp-dayswitch" ref={daySwitchRef}>
          <button className="tp-cal-btn" onClick={() => setShowCal((s) => !s)}>📅</button>
          {days.map((d) => (
            <button key={d.key} className={`tp-day${activeDay === d.key ? ' active' : ''}`} onClick={() => jumpToDay(d.key)}>
              <span className="tp-day-wd">{d.weekday}</span>
              <span className="tp-day-dt">{d.label}</span>
            </button>
          ))}
        </div>
      )}

      {showCal && (
        <div className="tp-cal-pop" onClick={() => setShowCal(false)}>
          <div className="tp-cal" onClick={(e) => e.stopPropagation()}>
            <div className="tp-cal-title">Jump to a day</div>
            <div className="tp-cal-grid">
              {days.map((d) => (
                <button key={d.key} className={`tp-cal-cell${activeDay === d.key ? ' active' : ''}`} onClick={() => jumpToDay(d.key)}>
                  <span className="tp-cal-wd">{d.weekday}</span>
                  <span className="tp-cal-dt">{d.date.getDate()}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="tp-body">
        {tab === 'overview' && <OverviewView trip={trip} events={events} onEditEvent={setEditEvent} />}
        {tab === 'itinerary' && (
          <ItineraryView
            trip={trip}
            events={events}
            activeDay={activeDay}
            setActiveDay={setActiveDay}
            scrollSignal={scrollSignal}
            onEventsChange={setEvents}
            onAddOnDay={(day) => setAddDay(day)}
            onEditEvent={setEditEvent}
          />
        )}
        {tab === 'explore' && (
          <ExploreView
            trip={trip}
            onAddIdea={async (w) => {
              await supabase.from('planned_events').insert({
                trip_id: tripId,
                title: w.title,
                city: w.country || w.title,
                kind: 'place',
                photo_url: w.image_url || null,
                note: w.notes || null,
                done: false,
              })
              await supabase.from('wishlist_items').update({ trip_id: tripId, status: 'planned' }).eq('id', w.id)
              loadEvents()
            }}
            onAskAI={(text) => setChat({ autoSend: text })}
          />
        )}
      </main>

      {tab === 'itinerary' && (
        <button className="tp-fab" onClick={() => setAddDay(activeDay || days[0]?.key || null)}>+</button>
      )}

      {addDay !== undefined && (
        <AddItemSheet
          tripId={tripId}
          day={addDay}
          onClose={() => setAddDay(undefined)}
          onAdded={loadEvents}
          onAskAI={(text) => setChat({ autoSend: text })}
        />
      )}

      {editEvent && (
        <EditEventModal
          event={editEvent}
          onClose={() => setEditEvent(null)}
          onSaved={() => {
            setEditEvent(null)
            loadEvents()
          }}
        />
      )}

      {chat && (
        <PlanChat
          tripId={tripId}
          autoSend={chat.autoSend}
          onClose={() => setChat(null)}
          onChanged={refreshAfterAI}
        />
      )}
    </div>
  )
}
