import { createContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import Placeholder from './tabs/Placeholder.jsx'
import TripsShell from './tabs/TripsShell.jsx'

export const TripContext = createContext({
  tripMeta: [],
  selectedTrip: null,
  setSelectedTrip: () => {},
})

const TABS = [
  { id: 'world',    label: 'World' },
  { id: 'trips',    label: 'Trips' },
  { id: 'flights',  label: 'Flights' },
  { id: 'journal',  label: 'Journal' },
  { id: 'map',      label: 'Map' },
  { id: 'costs',    label: 'Costs' },
  { id: 'photos',   label: 'Photos' },
  { id: 'currency', label: 'Currency' },
  { id: 'phrases',  label: 'Phrases' },
  { id: 'share',    label: 'Share' },
]

const SESSION_NOTES = {
  world:    ['session 3', 'Full-bleed map. Every flight route drawn in sequence — the mission briefing.'],
  flights:  ['session 2', 'Every flight, grouped by trip. Aircraft photos, great-circle paths, the geek stuff.'],
  journal:  ['session 5', 'Day-by-day entries with mood, city and tags.'],
  map:      ['session 6', 'Pins, hotels, runs and the journey line.'],
  costs:    ['session 7', 'Spend per trip by category, converted to AUD.'],
  photos:   ['session 8', 'Photo grid with lightbox, linked Google Photos albums.'],
  currency: ['session 9', 'AUD against KRW, HKD, JPY, CNY, USD, GBP.'],
  phrases:  ['session 10', 'Korean + Cantonese, tap to copy.'],
  share:    ['session 11', 'Read-only share links for friends.'],
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [bootLeaving, setBootLeaving] = useState(false)
  const [activeTab, setActiveTab] = useState('world')
  const [tripMeta, setTripMeta] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [selectedTrip, setSelectedTrip] = useState(null)

  useEffect(() => {
    let cancelled = false
    const started = Date.now()

    async function load() {
      const { data, error } = await supabase
        .from('trip_meta')
        .select('*')
        .order('sort_order', { ascending: true })

      if (cancelled) return
      if (error) setLoadError(error.message)
      else setTripMeta(data ?? [])

      // Hold the boot screen long enough to register, then fade out
      const minBoot = 1200
      const wait = Math.max(0, minBoot - (Date.now() - started))
      setTimeout(() => {
        if (cancelled) return
        setBootLeaving(true)
        setTimeout(() => !cancelled && setBooting(false), 550)
      }, wait)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const ctx = useMemo(
    () => ({ tripMeta, selectedTrip, setSelectedTrip }),
    [tripMeta, selectedTrip]
  )

  return (
    <TripContext.Provider value={ctx}>
      {booting && (
        <div className={`boot${bootLeaving ? ' leaving' : ''}`}>
          <div className="boot-title">NOT THAT CVNVRD</div>
          <div className="boot-sub">mini gap year · mar–jul 2026</div>
        </div>
      )}

      <div className="app">
        <header className="app-header">
          <div className="app-title">NOT THAT CVNVRD</div>
          <div className="app-subtitle">six trips · mar–jul 2026</div>
        </header>

        <nav className="tab-bar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="tab-panel">
          {loadError && <div className="error-note">supabase: {loadError}</div>}
          {activeTab === 'trips' ? (
            <TripsShell />
          ) : (
            <Placeholder
              code={SESSION_NOTES[activeTab][0]}
              note={SESSION_NOTES[activeTab][1]}
            />
          )}
        </main>
      </div>
    </TripContext.Provider>
  )
}
