import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { AHEAD_DAYS, laidOut, saidBriefly, stillToCome, todayHere } from '../lib/whereYouAre.js'
import { KIND_META } from '../lib/planItems.js'
import PlanFlightCard from './planner/PlanFlightCard.jsx'
import PhotoLens from './PhotoLens.jsx'
import { oops } from '../lib/analytics.js'

// The trip, from where you are standing in it.
//
// Every other view of a trip is written from one end or the other. The recap
// is a retrospective — sixteen days, seven cities, a thousand photographs —
// which is the right thing to show somebody about a holiday they took and
// the wrong thing to show somebody who is on day six of it and wants to know
// what time dinner is. The planner is the other end: an itinerary, all of it
// equally far away, with no mark for today.
//
// This is the middle. One lane, anchored on today:
//
//   behind    collapsed, a row a day, openable. You lived it.
//   today     open, and the only place the plan and the record meet.
//   ahead     open for a week — flights, check-ins, the things with times.
//   the rest  a number, openable, so a long trip has an end to its scroll.
//
// The decision about what goes where is in whereYouAre.js and is tested
// there, against the days that are awkward to stand on: the first, the last,
// a trip nobody has closed, a hundred-day trip.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Tue 18 Aug" — read at a glance, in a column of other days. */
function said(date) {
  const d = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  return `${WEEK[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/**
 * Up to five, so a collapsed row is a glance rather than a gallery.
 *
 * `onOpen` is the way in to the full set — omitted for the preview that
 * lives inside the day's own toggle button, since a button cannot nest
 * another one, and that row already does something on tap. Passed for
 * every strip that has room of its own, which is where "cannot tap into
 * them" was reported: a row of photographs you could look at and not open,
 * the same fault PlannerPhotos had before PhotoLens existed.
 */
function Strip({ photos, cap = 5, onOpen }) {
  const few = photos.slice(0, cap)
  if (!few.length) return null
  if (!onOpen) {
    return (
      <span className="td-strip" aria-hidden="true">
        {few.map((p) => (
          <img key={p.id} className="td-thumb" src={p.thumb_url || p.url} alt="" loading="lazy" />
        ))}
        {photos.length > few.length && <span className="td-more">+{photos.length - few.length}</span>}
      </span>
    )
  }
  return (
    <span className="td-strip">
      {few.map((p, i) => (
        <button key={p.id} className="td-thumb-btn" onClick={() => onOpen(i)}>
          <img className="td-thumb" src={p.thumb_url || p.url} alt="" loading="lazy" />
        </button>
      ))}
      {photos.length > few.length && (
        <button className="td-more td-more-btn" onClick={() => onOpen(few.length)}>
          +{photos.length - few.length}
        </button>
      )}
    </span>
  )
}

/** One thing with a time on it. Flights get the span card; everything else is
 *  a row, because a hotel and a museum do not need two layouts. */
function Thing({ ev }) {
  if (ev.kind === 'flight') return <PlanFlightCard event={ev} />
  const meta = KIND_META[ev.kind] || KIND_META.other
  return (
    <div className={`td-thing${ev.done ? ' done' : ''}`}>
      <span className="td-tick" style={{ borderColor: meta.color, background: ev.done ? meta.color : 'transparent' }}>
        {ev.done ? '✓' : meta.icon}
      </span>
      <span className="td-thing-body">
        {ev.start_time && <span className="td-time">{String(ev.start_time).slice(0, 5)}</span>}
        <span className="td-thing-title">{ev.title}</span>
        {ev.note && <span className="td-note">{ev.note}</span>}
      </span>
    </div>
  )
}

/** The nights you are inside a stay, as against the day you checked into it.
 *  Quiet: it is the answer to "where am I sleeping", which is a thing you
 *  want available rather than announced. */
function Nights({ stay }) {
  if (!stay?.length) return null
  return (
    <div className="td-nights">
      {stay.map(({ stay: s, night, of }) => (
        <span key={s.id ?? s.title} className="td-night">
          {s.title.replace(/^Hotel — /, '')} · night {night} of {of}
        </span>
      ))}
    </div>
  )
}

function Behind({ day, open, onToggle }) {
  // Which photograph of this day is open in the lens, or null.
  const [lensAt, setLensAt] = useState(null)
  return (
    <div className={`td-day td-day--behind${open ? ' open' : ''}`}>
      <button className="td-row" onClick={onToggle}>
        <span className="td-when">
          <span className="td-n">{day.index}</span>
          <span className="td-date">{said(day.date)}</span>
        </span>
        <span className="td-said">{saidBriefly(day)}</span>
        {!open && <Strip photos={day.photos} cap={3} />}
      </button>
      {open && (
        <div className="td-open">
          <Nights stay={day.stay} />
          {day.events.map((e) => (
            <Thing key={e.id} ev={e} />
          ))}
          <Strip photos={day.photos.slice(0, 12)} onOpen={setLensAt} />
        </div>
      )}
      {lensAt !== null && (
        <PhotoLens photos={day.photos} at={lensAt} onClose={() => setLensAt(null)} />
      )}
    </div>
  )
}

export default function TripDays({ trip }) {
  const [events, setEvents] = useState(null)
  const [photos, setPhotos] = useState(null)
  const [opened, setOpened] = useState(() => new Set())
  const [showRest, setShowRest] = useState(false)
  // Recomputed on the day rolling over rather than on every render, so a
  // phone left open overnight is not still showing yesterday in the morning.
  const [today, setToday] = useState(todayHere)
  const alive = useRef(true)

  useEffect(() => () => { alive.current = false }, [])

  useEffect(() => {
    const tick = setInterval(() => setToday((was) => (todayHere() === was ? was : todayHere())), 60000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (!trip?.id) return
    let stop = false
    ;(async () => {
      try {
        const [e, p] = await Promise.all([
          supabase.from('planned_events').select('*').eq('trip_id', trip.id),
          supabase
            .from('photos')
            .select('id,thumb_url,url,taken_on,taken_at,city')
            .eq('trip_id', trip.id)
            .neq('kind', 'receipt')
            .order('taken_at', { ascending: true }),
        ])
        if (stop || !alive.current) return
        setEvents(e.data ?? [])
        setPhotos(p.data ?? [])
      } catch (err) {
        oops('trip', err, 'TripDays/load')
        if (!stop && alive.current) {
          setEvents([])
          setPhotos([])
        }
      }
    })()
    return () => { stop = true }
  }, [trip?.id])

  // Above every early return, and a useMemo rather than a bare const.
  //
  // Both halves of that are scar tissue. A const read from an effect above
  // its own declaration is a temporal dead zone and throws at render, which
  // went out to production and to TestFlight; moving the effect below it
  // instead put a hook underneath an early return, which is worse. Hooks
  // first, derived values second, returns last.
  const lane = useMemo(
    () => laidOut({ trip, today, events: events ?? [], photos: photos ?? [], ahead: showRest ? 3650 : AHEAD_DAYS }),
    [trip, today, events, photos, showRest]
  )

  // Which of today's photographs is open in the lens, or null. Its own
  // state — Behind's lens is per-day and lives inside Behind itself.
  const [todayLensAt, setTodayLensAt] = useState(null)

  if (!events || !photos) return <div className="td-wait">Reading the days…</div>

  const left = stillToCome(lane.today)

  return (
    <div className="trip-days">
      {lane.behind.length > 0 && (
        <div className="td-block">
          <div className="td-label">Behind you</div>
          {lane.behind.map((d) => (
            <Behind
              key={d.date}
              day={d}
              open={opened.has(d.date)}
              onToggle={() =>
                setOpened((was) => {
                  const next = new Set(was)
                  if (next.has(d.date)) next.delete(d.date)
                  else next.add(d.date)
                  return next
                })
              }
            />
          ))}
        </div>
      )}

      {lane.today && (
        <div className="td-block td-block--today">
          <div className="td-label td-label--today">Today</div>
          <div className="td-day td-day--today">
            <div className="td-row td-row--today">
              <span className="td-when">
                <span className="td-n">{lane.today.index}</span>
                <span className="td-date">{said(lane.today.date)}</span>
              </span>
              {/* The one number today's card can say that no other day's can.
                  From the ticks rather than the clock — see stillToCome. */}
              <span className="td-left">
                {left === 0 ? 'nothing left booked' : left === 1 ? '1 still to come' : `${left} still to come`}
              </span>
            </div>
            <Nights stay={lane.today.stay} />
            {lane.today.events.map((e) => (
              <Thing key={e.id} ev={e} />
            ))}
            {lane.today.photos.length > 0 && (
              <div className="td-sofar">
                <span className="td-sofar-label">So far today</span>
                <Strip photos={lane.today.photos} onOpen={setTodayLensAt} />
              </div>
            )}
          </div>
          {todayLensAt !== null && (
            <PhotoLens photos={lane.today.photos} at={todayLensAt} onClose={() => setTodayLensAt(null)} />
          )}
        </div>
      )}

      {lane.ahead.length > 0 && (
        <div className="td-block">
          <div className="td-label">{lane.today ? 'Still to come' : 'Ahead'}</div>
          {lane.ahead.map((d) => (
            <div key={d.date} className="td-day td-day--ahead">
              <div className="td-row">
                <span className="td-when">
                  <span className="td-n">{d.index}</span>
                  <span className="td-date">{said(d.date)}</span>
                </span>
              </div>
              <Nights stay={d.stay} />
              {d.events.map((e) => (
                <Thing key={e.id} ev={e} />
              ))}
              {/* An empty day ahead is not a gap in the data, it is a day
                  nobody has booked anything on — which on a trip you are
                  planning is the interesting kind of empty. */}
              {!d.events.length && !d.stay.length && <div className="td-free">Nothing booked</div>}
            </div>
          ))}
        </div>
      )}

      {lane.rest > 0 && (
        <button className="td-rest" onClick={() => setShowRest(true)}>
          and {lane.rest} more {lane.rest === 1 ? 'day' : 'days'} →
        </button>
      )}
    </div>
  )
}
