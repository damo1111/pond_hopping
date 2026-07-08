import { useEffect, useRef, useState } from 'react'

// Trip filter control shown on every tab except Home (which has its own
// card carousel) — lets you pick or change the trip from anywhere,
// instead of only being able to clear it and having to go back Home to
// pick a different one.
export default function TripPicker({ tripMeta, selectedTrip, setSelectedTrip }) {
  const [open, setOpen] = useState(false)
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

  return (
    <div className="trip-picker" ref={ref}>
      <button className="trip-picker-btn" onClick={() => setOpen((o) => !o)}>
        <span className="trip-picker-label">
          {current ? `${current.countries?.join(' ')} ${current.title}` : 'All trips'}
        </span>
        <span className={`trip-picker-caret${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="trip-picker-menu">
          <button
            className={`trip-picker-item${!selectedTrip ? ' active' : ''}`}
            onClick={() => {
              setSelectedTrip(null)
              setOpen(false)
            }}
          >
            All trips
          </button>
          {tripMeta.map((t) => (
            <button
              key={t.slug}
              className={`trip-picker-item${selectedTrip === t.slug ? ' active' : ''}`}
              onClick={() => {
                setSelectedTrip(t.slug)
                setOpen(false)
              }}
            >
              {t.countries?.join(' ')} {t.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
