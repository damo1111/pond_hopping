import { createContext, lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'
import Placeholder from './tabs/Placeholder.jsx'
import FlightsTab from './tabs/FlightsTab.jsx'
import JournalTab from './tabs/JournalTab.jsx'
import MapTab from './tabs/MapTab.jsx'
import CurrencyTab from './tabs/CurrencyTab.jsx'
import PhrasesTab from './tabs/PhrasesTab.jsx'
import PhotosTab from './tabs/PhotosTab.jsx'
import CostsTab from './tabs/CostsTab.jsx'
import ShareTab from './tabs/ShareTab.jsx'
import ShareView from './ShareView.jsx'
import InstallChip from './components/InstallChip.jsx'
import TripPicker from './components/TripPicker.jsx'
import { tripColor } from './lib/tripColors.js'

// The 3D globe pulls in three.js — only the Home tab needs it, so it's
// code-split into its own chunk instead of bloating everyone's first load.
const WorldTab = lazy(() => import('./tabs/WorldTab.jsx'))

export const TripContext = createContext({
  tripMeta: [],
  selectedTrip: null,
  setSelectedTrip: () => {},
  journalJump: null,
  jumpToJournal: () => {},
  clearJournalJump: () => {},
})

const TABS = [
  { id: 'world',    label: 'Home',    icon: '🌏' },
  { id: 'flights',  label: 'Flights', icon: '✈️' },
  { id: 'journal',  label: 'Journal', icon: '📔' },
  { id: 'map',      label: 'Map',     icon: '🗺️' },
  { id: 'photos',   label: 'Photos',  icon: '📷' },
  { id: 'useful',   label: 'Useful',  icon: '🧰' },
]

const USEFUL_TABS = [
  { id: 'costs',    label: 'Costs',    icon: '💰' },
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

const SHARE_PARAMS = (() => {
  const q = new URLSearchParams(window.location.search)
  const slug = q.get('share')
  if (!slug) return null
  const show = (q.get('show') || 'journal,flights,map').split(',').filter(Boolean)
  return { slug, show }
})()

export default function App() {
  const [booting, setBooting] = useState(true)
  const [bootLeaving, setBootLeaving] = useState(false)
  const [activeTab, setActiveTab] = useState('world')
  const [usefulTab, setUsefulTab] = useState('costs')
  const [tripMeta, setTripMeta] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [selectedTrip, setSelectedTrip] = useState(null)
  // Deep-link from a Map pin/run into its matching Journal entry.
  const [journalJump, setJournalJump] = useState(null)

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

  // Carry the selected trip's globe accent colour through to every other
  // tab as a CSS var, so section headers etc. can echo it without each
  // one re-deriving the trip → colour mapping.
  useEffect(() => {
    document.documentElement.style.setProperty('--trip-accent', tripColor(selectedTrip))
  }, [selectedTrip])

  function jumpToJournal(tripSlug, date) {
    setSelectedTrip(tripSlug)
    setActiveTab('journal')
    setJournalJump({ tripSlug, date, key: Date.now() })
  }

  const ctx = useMemo(
    () => ({
      tripMeta,
      selectedTrip,
      setSelectedTrip,
      journalJump,
      jumpToJournal,
      clearJournalJump: () => setJournalJump(null),
    }),
    [tripMeta, selectedTrip, journalJump]
  )

  // Public read-only share page — no nav, no forms.
  if (SHARE_PARAMS) {
    return <ShareView slug={SHARE_PARAMS.slug} show={SHARE_PARAMS.show} />
  }

  return (
    <TripContext.Provider value={ctx}>
      {booting && (
        <div className={`boot${bootLeaving ? ' leaving' : ''}`}>
          <img className="boot-duck" src="/duck.png" alt="" />
          <div className="boot-title">
            <span className="app-title-thin">Pond</span>
            <span className="app-title-bold">Hopping</span>
          </div>
        </div>
      )}

      <div className="app">
        <header className="app-header">
          <img className="header-duck" src="/duck.png" alt="" />
          <div>
            <div className="app-title">
              <span className="app-title-thin">Pond</span>
              <span className="app-title-bold">Hopping</span>
            </div>
          </div>
          <InstallChip />
        </header>

        {activeTab !== 'world' && (
          <TripPicker tripMeta={tripMeta} selectedTrip={selectedTrip} setSelectedTrip={setSelectedTrip} />
        )}

        {activeTab === 'useful' && (
          <nav className="subnav">
            {USEFUL_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`subnavitem${usefulTab === tab.id ? ' active' : ''}`}
                onClick={() => setUsefulTab(tab.id)}
              >
                <span className="subnavitem-i">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        <main className={`tab-panel${activeTab === 'world' || activeTab === 'map' ? ' full' : ''}`}>
          {loadError && <div className="error-note">supabase: {loadError}</div>}
          {activeTab === 'world' ? (
            <Suspense fallback={<div className="tab-loading">loading the world…</div>}>
              <WorldTab />
            </Suspense>
          ) : activeTab === 'flights' ? (
            <FlightsTab />
          ) : activeTab === 'journal' ? (
            <JournalTab />
          ) : activeTab === 'map' ? (
            <MapTab />
          ) : activeTab === 'photos' ? (
            <PhotosTab />
          ) : activeTab === 'useful' ? (
            usefulTab === 'currency' ? (
              <CurrencyTab />
            ) : usefulTab === 'phrases' ? (
              <PhrasesTab />
            ) : usefulTab === 'share' ? (
              <ShareTab />
            ) : (
              <CostsTab />
            )
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
