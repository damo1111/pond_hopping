import { useEffect, useRef, useState } from 'react'
import CountryFlags from './CountryFlags.jsx'
import { groupTrips, chapterRange, chapterCountries } from '../lib/tripGroups.js'

// Trip filter control shown on every tab except Home (which has its own
// card carousel) — lets you pick or change the trip from anywhere,
// instead of only being able to clear it and having to go back Home to
// pick a different one.
export default function TripPicker({ tripMeta, selectedTrip, setSelectedTrip }) {
  const [open, setOpen] = useState(false)
  // Which chapter (e.g. "2024 Gap Year") is expanded within the dropdown
  // — collapsed groups keep a long travel history from becoming an
  // endless scroll of individual trips.
  const [openChapter, setOpenChapter] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocPointer = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer)
    return () => document.removeEventListener('pointerdown', onDocPointer)
  }, [open])

  const current = tripMeta.find((t) => t.slug === selectedTrip)

  function pick(slug) {
    setSelectedTrip(slug)
    setOpen(false)
  }

  return (
    <div className="trip-picker" ref={ref}>
      <button className="trip-picker-btn" onClick={() => setOpen((o) => !o)}>
        <span className="trip-picker-label trip-flags-inline">
          {current ? (
            <>
              <CountryFlags countries={current.countries} size={16} /> {current.title}
            </>
          ) : (
            'All trips'
          )}
        </span>
        <span className={`trip-picker-caret${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="trip-picker-menu">
          <button
            className={`trip-picker-item${!selectedTrip ? ' active' : ''}`}
            onClick={() => pick(null)}
          >
            All trips
          </button>
          {groupTrips(tripMeta).map((item) => {
            if (item.type === 'trip') {
              const t = item.trip
              return (
                <button
                  key={t.slug}
                  className={`trip-picker-item trip-flags-inline${selectedTrip === t.slug ? ' active' : ''}`}
                  onClick={() => pick(t.slug)}
                >
                  <CountryFlags countries={t.countries} size={16} /> {t.title}
                </button>
              )
            }

            const { chapter, trips } = item
            const isOpen = openChapter === chapter
            return (
              <div key={chapter} className="trip-picker-chapter">
                <button
                  className="trip-picker-item trip-flags-inline trip-picker-chapter-head"
                  onClick={() => setOpenChapter(isOpen ? null : chapter)}
                >
                  <CountryFlags countries={chapterCountries(trips)} size={16} />
                  {chapter}
                  <span className="trip-picker-chapter-meta">
                    {trips.length} trips · {chapterRange(trips)}
                  </span>
                  <span className={`trip-picker-caret${isOpen ? ' open' : ''}`}>▾</span>
                </button>
                {isOpen &&
                  trips.map((t) => (
                    <button
                      key={t.slug}
                      className={`trip-picker-item trip-picker-item-nested trip-flags-inline${selectedTrip === t.slug ? ' active' : ''}`}
                      onClick={() => pick(t.slug)}
                    >
                      <CountryFlags countries={t.countries} size={16} /> {t.title}
                    </button>
                  ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
