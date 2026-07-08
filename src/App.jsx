import { createContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import Placeholder from './tabs/Placeholder.jsx'
import TripsTab from './tabs/TripsTab.jsx'
import FlightsTab from './tabs/FlightsTab.jsx'
import WorldTab from './tabs/WorldTab.jsx'
import JournalTab from './tabs/JournalTab.jsx'
import MapTab from './tabs/MapTab.jsx'
import CurrencyTab from './tabs/CurrencyTab.jsx'
import PhrasesTab from './tabs/PhrasesTab.jsx'
import PhotosTab from './tabs/PhotosTab.jsx'
import InstallChip from './components/InstallChip.jsx'

export const TripContext = createContext({
  tripMeta: [],
  selectedTrip: null,
  setSelectedTrip: () => {},
})

const TABS = [
  { id: 'world',    label: 'World',    icon: '🌏' },
  { id: 'trips',    label: 'Trips',    icon: '🧳' },
  { id: 'flights',  label: 'Flights',  icon: '✈️' },
  { id: 'journal',  label: 'Journal',  icon: '📔' },
  { id: 'map',      label: 'Map',      icon: '🗺️' },
  { id: 'costs',    label: 'Costs',    icon: '💰' },
  { id: 'photos',   label: 'Photos',   icon: '📷' },
  { id: 'currency', label: 'Currency', icon: '💱' },
  { id: 'phrases',  label: 'Phrases',  icon: '💬' },
  { id: 'share',    label: 'Share',    icon: '🔗' },
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
          <img className="boot-duck" src="/duck.png" alt="" />
          <div className="boot-title">POND HOPPING</div>
          <div className="boot-sub">travel logs · est. mar 2026</div>
        </div>
      )}

      <div className="app">
        <header className="app-header">
          <img className="header-duck" src="/duck.png" alt="" />
          <div>
            <div className="app-title">POND HOPPING</div>
            <div className="app-subtitle">mini gap year · mar–jul 2026</div>
          </div>
          <InstallChip />
        </header>

        <main className={`tab-panel${activeTab === 'world' || activeTab === 'map' ? ' full' : ''}`}>
          {loadError && <div className="error-note">supabase: {loadError}</div>}
          {activeTab === 'world' ? (
            <WorldTab />
          ) : activeTab === 'trips' ? (
            <TripsTab />
          ) : activeTab === 'flights' ? (
            <FlightsTab />
          ) : activeTab === 'journal' ? (
            <JournalTab />
          ) : activeTab === 'map' ? (
            <MapTab />
          ) : activeTab === 'currency' ? (
            <CurrencyTab />
          ) : activeTab === 'phrases' ? (
            <PhrasesTab />
          ) : activeTab === 'photos' ? (
            <PhotosTab />
          ) : (
            <Placeholder
              code={SESSION_NOTES[activeTab][0]}
              note={SESSION_NOTES[activeTab][1]}
            />
          )}
        </main>

        <nav className="bottomnav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`navitem${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="navitem-i">{tab.icon}</span>
              <span className="navitem-l">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </TripContext.Provider>
  )
}
