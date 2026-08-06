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
import PlanTab from './tabs/PlanTab.jsx'
import AccountTab from './tabs/AccountTab.jsx'
import ShareView from './ShareView.jsx'
import InstallChip from './components/InstallChip.jsx'
import TripPicker from './components/TripPicker.jsx'
import Icon from './components/Icon.jsx'
import AuthSheet from './components/AuthSheet.jsx'
import Onboarding from './components/Onboarding.jsx'
import BootScreen from './components/BootScreen.jsx'
import { tripColor } from './lib/tripColors.js'
import { track } from './lib/analytics.js'
import { AuthProvider, useAuth } from './lib/AuthContext.jsx'
import { installVisitSync } from './lib/visits.js'

// The 3D globe pulls in three.js — only the Home tab needs it, so it's
// code-split into its own chunk instead of bloating everyone's first load.
const WorldTab = lazy(() => import('./tabs/WorldTab.jsx'))

export const TripContext = createContext({
  tripMeta: [],
  tripsLoaded: false,
  selectedTrip: null,
  setSelectedTrip: () => {},
  journalJump: null,
  jumpToJournal: () => {},
  clearJournalJump: () => {},
  plannerJump: null,
  openPlanner: () => {},
  openAuth: () => {},
  clearPlannerJump: () => {},
  goToTab: () => {},
})

// Every screen here is either about *all* your travel or about *one* trip,
// and only the first kind belongs in the bottom bar. Journal, Map and Photos
// are the second kind — they used to sit here with a trip picker bolted on
// top, which is the tell: a tab that has to ask which trip is a trip view you
// reached through the wrong door. They're still very much in the app, you
// just enter them from a trip on Home.
//
// Flights goes the other way. It's the one genuinely cross-trip thing we
// have — 87 airports, most of a lifetime — and it was buried in a drawer
// next to Currency and Phrases.
const TABS = [
  { id: 'world',    label: 'Home',    icon: 'globe' },
  { id: 'plan',     label: 'Plan',    icon: 'compass' },
  { id: 'flights',  label: 'Flights', icon: 'plane' },
  { id: 'useful',   label: 'Useful',  icon: 'kit' },
]

const USEFUL_TABS = [
  { id: 'costs',    label: 'Costs',    icon: 'coin' },
  { id: 'currency', label: 'Currency', icon: 'exchange' },
  { id: 'phrases',  label: 'Phrases',  icon: 'speech' },
  { id: 'share',    label: 'Share',    icon: 'share' },
  { id: 'account',  label: 'Account',  icon: 'person' },
]

// Reachable only by entering a trip on Home — no longer in the bottom bar.
const TRIP_TABS = ['journal', 'map', 'photos']

// Where you are and how to leave, in the strip the trip picker used to
// occupy. Doubles as the answer to "which trip am I looking at?", which the
// dropdown only ever answered by accident.
function TripCrumb({ trip, onBack }) {
  return (
    <button className="trip-crumb" onClick={onBack}>
      <span className="trip-crumb-back">←</span>
      <span className="trip-crumb-title">{trip?.title ?? 'All trips'}</span>
    </button>
  )
}

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
  const { user, authLoading, profile } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [booting, setBooting] = useState(true)
  const [bootLeaving, setBootLeaving] = useState(false)
  const [activeTab, setActiveTab] = useState('world')
  const [usefulTab, setUsefulTab] = useState('costs')
  const [tripMeta, setTripMeta] = useState([])
  const [tripsLoaded, setTripsLoaded] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [selectedTrip, setSelectedTrip] = useState(null)
  // Deep-link from a Map pin/run into its matching Journal entry.
  const [journalJump, setJournalJump] = useState(null)
  // A trip card on Home opening straight into that trip's planner. PlanTab
  // owns the full-screen TripPlanner, so this is the only way to say which
  // trip from outside it.
  const [plannerJump, setPlannerJump] = useState(null)

  useEffect(() => {
    let cancelled = false
    const started = Date.now()

    // The boot screen is a flourish, not a loading gate, so it comes off on
    // a timer and nothing else. It used to wait for the trip list, which
    // meant a dropped connection left the duck bobbing on the splash for as
    // long as supabase-js took to give up — about ten seconds — and if the
    // call threw, the timers that end boot were skipped entirely and it
    // stayed there forever, with no error and no way out.
    //
    // The trips arrive when they arrive; the app is perfectly capable of
    // rendering an empty carousel for a moment.
    // Long enough for the cold open to finish its sentence: the sphere draws,
    // the route crosses it, the duck lands, and the name resolves at ~2.0s.
    // Cutting it at 1.2s was why the old screen read as a still image with a
    // twitch rather than as an opening.
    const minBoot = 2050
    const leave = setTimeout(() => {
      if (cancelled) return
      setBootLeaving(true)
      setTimeout(() => !cancelled && setBooting(false), 550)
    }, minBoot)

    async function load() {
      try {
        const { data, error } = await supabase
          .from('trip_meta')
          .select('*')
          .order('sort_order', { ascending: true })

        if (cancelled) return
        if (error) setLoadError(error.message)
        else {
          setTripMeta(data ?? [])
          setLoadError(null)
          // Only a clean read proves the account is genuinely empty. An
          // empty tripMeta otherwise just means "hasn't arrived", and Home
          // would greet a dropped connection with "nothing on the globe
          // yet" — which reads as data loss, not as a network blip.
          setTripsLoaded(true)
        }
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || 'Couldn’t reach the server.')
      }
    }

    load()
    return () => {
      cancelled = true
      clearTimeout(leave)
    }
  }, [])

  // Carry the selected trip's globe accent colour through to every other
  // tab as a CSS var, so section headers etc. can echo it without each
  // one re-deriving the trip → colour mapping.
  useEffect(() => {
    document.documentElement.style.setProperty('--trip-accent', tripColor(selectedTrip))
  }, [selectedTrip])

  useEffect(() => {
    track('app_open')
  }, [])

  // A new deploy's service worker can take control at any moment. Only
  // reloading once boot settles isn't enough on its own — with this many
  // deploys landing in quick succession, an update can just as easily
  // arrive right after boot finishes, which reloaded immediately and
  // looked like the app flashing to the loaded Home tab and straight back
  // to the splash screen. Reload only while nobody's actually looking:
  // if the tab's already hidden, do it now; otherwise wait for the next
  // time it's backgrounded (switching apps, locking the phone) so a
  // fresh version is just quietly waiting the next time it's opened.
  useEffect(() => {
    if (booting) return

    function reloadIfHidden() {
      if (document.visibilityState === 'hidden') window.location.reload()
    }

    function onUpdate() {
      if (document.visibilityState === 'hidden') {
        window.location.reload()
      } else {
        document.addEventListener('visibilitychange', reloadIfHidden)
      }
    }

    if (window.__pondSwUpdatePending) onUpdate()
    window.addEventListener('pond:sw-update', onUpdate)
    return () => {
      window.removeEventListener('pond:sw-update', onUpdate)
      document.removeEventListener('visibilitychange', reloadIfHidden)
    }
  }, [booting])

  useEffect(() => {
    track('tab_view', { tab: activeTab })
  }, [activeTab])

  // Visits pile up on the device while the app is closed — including on the
  // background launches iOS does purely to deliver one — so the upload has
  // to happen on the way in, not on the way out.
  useEffect(() => {
    if (!user) return
    return installVisitSync()
  }, [user])

  // This used to pulse the bottom bar when you picked a trip, because the
  // trip's journal, map and photos were down there. They're in the sheet
  // that just opened instead, so pointing away from it would now be
  // actively wrong.
  useEffect(() => {
    if (activeTab !== 'world' || !selectedTrip) return
    track('trip_select', { trip: selectedTrip })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrip, activeTab])

  function jumpToJournal(tripSlug, date) {
    setSelectedTrip(tripSlug)
    setActiveTab('journal')
    setJournalJump({ tripSlug, date, key: Date.now() })
  }

  const ctx = useMemo(
    () => ({
      tripMeta,
      tripsLoaded,
      selectedTrip,
      setSelectedTrip,
      journalJump,
      jumpToJournal,
      clearJournalJump: () => setJournalJump(null),
      plannerJump,
      // Sign-in used to be reachable only from the duck in the header, which
      // says nothing about why you would want to. Anything that needs an
      // account can now ask for one where the need arises.
      openAuth: () => setAuthOpen(true),
      openPlanner: (tripId) => {
        setPlannerJump({ id: tripId, key: Date.now() })
        setActiveTab('plan')
      },
      clearPlannerJump: () => setPlannerJump(null),
      // Callers (the trip story card, mostly) ask for a destination by name
      // without knowing whether it sits in the bottom bar or under Useful.
      // Resolve that here so moving a tab between the two doesn't break
      // every jump link in the app.
      goToTab: (tab) => {
        if (USEFUL_TABS.some((t) => t.id === tab)) {
          setUsefulTab(tab)
          setActiveTab('useful')
        } else {
          setActiveTab(tab)
        }
      },
    }),
    [tripMeta, tripsLoaded, selectedTrip, journalJump, plannerJump]
  )

  // Public read-only share page — no nav, no forms.
  if (SHARE_PARAMS) {
    return <ShareView slug={SHARE_PARAMS.slug} show={SHARE_PARAMS.show} />
  }

  // First run, once. Signed-out visitors deliberately don't see this —
  // they get the public globe, which is a far better pitch than a form.
  const needsOnboarding = !!user && !!profile && !profile.onboarded_at && !booting

  return (
    <TripContext.Provider value={ctx}>
      {needsOnboarding && <Onboarding onDone={() => setActiveTab('world')} />}

      {booting && <BootScreen leaving={bootLeaving} />}

      <div className="app">
        <header className={`app-header${activeTab === 'world' ? ' app-header--world' : ''}`}>
          <button
            className={`header-duck-btn${user ? ' signed-in' : ''}`}
            onClick={() => setAuthOpen(true)}
            aria-label={user ? 'Account' : 'Sign in'}
            title={user ? user.email : 'Sign in'}
          >
            <img className="header-duck" src="/duck.png" alt="" />
            {!authLoading && <span className={`header-duck-dot${user ? ' on' : ''}`} />}
          </button>
          <div>
            <div className="app-title">
              <span className="app-title-thin">Pond</span>
              <span className="app-title-bold">Hopping</span>
            </div>
          </div>
          <InstallChip />
        </header>

        {authOpen && <AuthSheet onClose={() => setAuthOpen(false)} />}

        {/* Journal, Map and Photos are always about the trip you came in
            from, so they say which one and offer the way back rather than a
            dropdown asking you to pick again. Costs and Share still keep the
            picker — they're per-trip too, but you can only reach them from
            the Useful drawer, so there's nothing to have come in from yet. */}
        {TRIP_TABS.includes(activeTab) ? (
          <TripCrumb
            trip={tripMeta.find((t) => t.slug === selectedTrip)}
            onBack={() => setActiveTab('world')}
          />
        ) : activeTab === 'useful' && (usefulTab === 'costs' || usefulTab === 'share') ? (
          <TripPicker tripMeta={tripMeta} selectedTrip={selectedTrip} setSelectedTrip={setSelectedTrip} />
        ) : null}

        {activeTab === 'useful' && (
          <nav className="subnav">
            {USEFUL_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`subnavitem${usefulTab === tab.id ? ' active' : ''}`}
                onClick={() => setUsefulTab(tab.id)}
              >
                <Icon name={tab.icon} size={17} className="subnavitem-i" />
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        <main className={`tab-panel${activeTab === 'world' || activeTab === 'map' ? ' full' : ''}`}>
          {/* "supabase: TypeError: Failed to fetch" tells the reader nothing
              they can act on, and there was no way to try again short of
              killing the app. */}
          {loadError && (
            <div className="error-note load-error">
              <span>{loadError}</span>
              <button className="load-retry" onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          )}
          {activeTab === 'world' ? (
            <Suspense fallback={<div className="tab-loading">loading the world…</div>}>
              <WorldTab />
            </Suspense>
          ) : activeTab === 'plan' ? (
            <PlanTab />
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
            ) : usefulTab === 'account' ? (
              <AccountTab />
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
            // navitem-<id> is an anchor, not a style — the demo tour points
            // at a named tab and needs a way to find it.
            <button
              key={tab.id}
              className={`navitem navitem-${tab.id}${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon name={tab.icon} size={22} className="navitem-i" />
              <span className="navitem-l">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </TripContext.Provider>
  )
}
