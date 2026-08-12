import { createContext, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import ShowcaseView from './ShowcaseView.jsx'
import InstallChip from './components/InstallChip.jsx'
import TripPicker from './components/TripPicker.jsx'
import Icon from './components/Icon.jsx'
import AuthSheet from './components/AuthSheet.jsx'
import BootScreen from './components/BootScreen.jsx'
import DayLookBack from './components/DayLookBack.jsx'
import { ONCE, bringOldFlagsOver, markSeen, nextUp } from './lib/firstRun.js'
import { readPreference, visibleTrips, writePreference } from './lib/demoVisibility.js'
import { tripColor } from './lib/tripColors.js'
import { busy, whenIdle } from './lib/busy.js'
import { Capacitor } from '@capacitor/core'
import { nowLooking, track } from './lib/analytics.js'
import { AuthProvider, useAuth } from './lib/AuthContext.jsx'
import { disableVisits, enableVisits, hasConsented, installVisitSync, visitStatus, visitsSupported } from './lib/visits.js'
import { nextAction } from './lib/visitWindow.js'
import { listenForPushTaps, onPushTap } from './lib/push.js'

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
  closePlanner: () => {},
  openAuth: () => {},
  clearPlannerJump: () => {},
  goToTab: () => {},
  lookBackJump: null,
  clearLookBackJump: () => {},
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

// Four, not five. The fifth scrolled off the edge of a Pixel, and it was
// Account — the one thing in the drawer you reach for repeatedly, and the
// only one that isn't about a trip. It lives under the duck now, which is
// where a person is, and where the sign-in dot has always been.
const USEFUL_TABS = [
  { id: 'costs',    label: 'Costs',    icon: 'coin' },
  { id: 'currency', label: 'Currency', icon: 'exchange' },
  { id: 'phrases',  label: 'Phrases',  icon: 'speech' },
  { id: 'share',    label: 'Share',    icon: 'share' },
]

// Still reachable by name — it just isn't in the row any more. Kept apart
// so that removing a tab from the nav never quietly breaks a jump to it.
const USEFUL_ROUTES = [...USEFUL_TABS, { id: 'account' }]

// Reachable only by entering a trip on Home — no longer in the bottom bar.
const TRIP_TABS = ['journal', 'map', 'photos']

// How long the app has to stay out of sight before a pending update is
// allowed to reload it. Long enough to sit out a permission dialog or a
// glance at the notification shade, short enough that putting the phone
// down for a moment still picks the new version up.
const AWAY_BEFORE_RELOAD_MS = 8000

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

// One revocable link to the whole log, for showing someone. Read before the
// app mounts, like the per-trip share, so it never flashes the real UI first.
const SHOWCASE_TOKEN = new URLSearchParams(window.location.search).get('showcase')

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
  const [photosChanged, setPhotosChanged] = useState(0)
  // What this launch still owes them, decided once at mount so dismissing
  // something does not fight a re-render.
  //
  // firstRun.js hands back *one* thing, never a queue. A hopper who has seen
  // nothing meets the cold open today, the pitch next launch and the line
  // about whose trip that is the launch after — rather than all three inside
  // eight seconds, which is what four uncoordinated flags used to do.
  const [owed, setOwed] = useState(() => {
    bringOldFlagsOver()
    return nextUp()
  })
  // Fixed for the life of this launch rather than read live.
  //
  // The timer that ends the opening marks it seen and moves `owed` on, and
  // that happens in the same tick as the fade begins. Read live, act two —
  // the photographs, the route and the sentence — was pulled out of the DOM
  // on exactly the frame the screen started fading, so the pitch vanished
  // and an empty globe faded out after it. Caught by tracing the DOM frame
  // by frame; invisible in a screenshot at any single moment.
  const [meetsColdOpen] = useState(() => owed === ONCE.cold_open)
  const [bootLeaving, setBootLeaving] = useState(false)
  const [activeTab, setActiveTab] = useState('world')
  const [usefulTab, setUsefulTab] = useState('costs')
  const [tripMeta, setTripMeta] = useState([])
  // 'auto' | 'show' | 'hide'. Read once; the Account switch updates it in
  // place so the globe changes under you rather than on next launch.
  const [demoPref, setDemoPref] = useState(() => readPreference())
  const [tripsLoaded, setTripsLoaded] = useState(false)
  const [loadError, setLoadError] = useState(null)
  // Forwarded bookings waiting to be reviewed. The banner that announces them
  // lives inside the Plan tab, which is no use to somebody who never opens
  // Plan — and the push that would have told them only reaches a native build
  // with notifications granted, which is nobody on iOS yet. So the nav says
  // there is something waiting, from wherever you happen to be standing.
  const [pendingImports, setPendingImports] = useState(0)
  const [selectedTrip, setSelectedTrip] = useState(null)
  // Deep-link from a Map pin/run into its matching Journal entry.
  const [journalJump, setJournalJump] = useState(null)
  // A trip card on Home opening straight into that trip's planner. PlanTab
  // owns the full-screen TripPlanner, so this is the only way to say which
  // trip from outside it.
  const [plannerJump, setPlannerJump] = useState(null)
  // Which tab to put back when the planner closes.
  //
  // Opening a trip from Home switches to Plan, because Plan owns the
  // planner — an implementation detail that was leaking into the way out.
  // The back arrow said "back" and landed you on a tab you had never been
  // on, one step further from Home than when you started. Null when the
  // planner was opened from Plan itself, which is already where you were.
  //
  // A ref rather than state: nothing renders from it, and calling one
  // setter from inside another's updater is the kind of thing StrictMode
  // runs twice.
  const plannerReturn = useRef(null)
  // Where a tapped notification wants to go, and where the evening
  // look-back it opened should land. Two pieces of state because they have
  // different lifetimes: the first is consumed the moment it can be, the
  // second is read by a screen that may not have mounted yet.
  const [pushJump, setPushJump] = useState(null)
  const [lookBackJump, setLookBackJump] = useState(null)

  // Listen for taps before anything else happens.
  //
  // The case this is shaped around is the app not running: the tap is what
  // launches it, and the event fires during startup, before the session is
  // restored and before the trip list exists. push.js holds the
  // destination until this asks for it, so arriving late is fine — but
  // attaching late is not, which is why this is its own effect at mount
  // rather than something registerPush does once somebody is signed in.
  useEffect(() => {
    listenForPushTaps()
    return onPushTap(setPushJump)
  }, [])

  useEffect(() => {
    let cancelled = false

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
    //
    // Only the first time, though. Two and a half seconds of it is an
    // opening on launch one and a toll booth on launch forty — David, 12
    // August: "on first open but not every time. it is overkill. and
    // annoying perhaps every time." Afterwards it holds just long enough to
    // cover the first paint, so there is still no flash of half-built app.
    //
    // Six seconds because the opening now carries the pitch as well: act two
    // runs photographs onto the globe, folds them into a route and finishes a
    // sentence at 4.85s. That used to be a card afterwards, which is a screen
    // this no longer needs — so the first run is shorter than it was, not
    // longer.
    //
    // Two things are in the number and only one of them is arithmetic.
    //
    // The arithmetic: this timer starts at mount and the animation starts at
    // first paint, so the CSS clock runs a frame or two behind it — measured
    // at ~120ms in Chromium. Cutting at 4850 began the fade while the last
    // word was still arriving.
    //
    // The judgement: the sentence has to be *held*, not merely reached. At
    // 5100 it stood finished for about a third of a second, which is long
    // enough to notice and not long enough to read — David, 12 August: "the
    // third part of the loading animation was too quick. Needs to hold
    // longer." It now holds for a second and a half, which is about what
    // seven words take.
    const minBoot = meetsColdOpen ? 6300 : 500
    const leave = setTimeout(() => {
      if (cancelled) return
      if (meetsColdOpen) {
        markSeen(ONCE.cold_open)
        setOwed(nextUp())
      }
      setBootLeaving(true)
      setTimeout(() => !cancelled && setBooting(false), 550)
    }, minBoot)

    return () => {
      cancelled = true
      clearTimeout(leave)
    }
  }, [])

  // Load the trips, and load them again when the session arrives.
  //
  // Restoring a session is asynchronous. This used to run once at mount,
  // which on a cold start is a race it usually lost: the read went out
  // before the token existed, PostgREST answered it as an anonymous
  // request, and RLS quite correctly returned only the public trips. The
  // list then never refetched, so somebody who had just signed in was
  // looking at one demo trip and sixteen of their own missing — with no
  // error, because nothing had actually failed.
  //
  // Keyed on the signed-in id, so signing in refetches and signing out
  // falls back to the public set. The first anonymous read is deliberate
  // rather than a cost: a fresh install shows a globe full of real
  // journeys instead of an empty state.
  // Hoisted out of the effect so it can be called again on demand.
  //
  // Making a trip used to end in window.location.reload(). That works, and
  // it costs a full boot of the app to add one row to a list already held
  // in memory: on iOS a white flash, the globe rebuilt from nothing, every
  // query re-run, and whatever screen you were on gone. The trip did
  // appear, so it looked like success — but it read as the app falling over
  // at the exact moment somebody first trusted it with something.
  //
  // `cancelled` is deliberately not carried across: it guards the mount
  // path, where a reply landing after a sign-out would repopulate the globe
  // with the previous account's trips. An explicit refresh has no such
  // race, because somebody asked for it.
  const loadTrips = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('trip_meta')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) {
        setLoadError(error.message)
        return null
      }
      setTripMeta(data ?? [])
      setLoadError(null)
      // Only a clean read proves the account is genuinely empty. An empty
      // tripMeta otherwise just means "hasn't arrived", and Home would
      // greet a dropped connection with "nothing on the globe yet" — which
      // reads as data loss, not as a network blip.
      setTripsLoaded(true)
      return data ?? []
    } catch (e) {
      setLoadError(e?.message || 'Couldn’t reach the server.')
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

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
          setTripsLoaded(true)
        }
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || 'Couldn’t reach the server.')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Carry the selected trip's globe accent colour through to every other
  // tab as a CSS var, so section headers etc. can echo it without each
  // one re-deriving the trip → colour mapping.
  useEffect(() => {
    document.documentElement.style.setProperty('--trip-accent', tripColor(selectedTrip))
  }, [selectedTrip])

  useEffect(() => {
    track('app_open', {
      // Which shell it is, because a fault that only happens inside the iOS
      // wrapper is a different fault, and until now every session looked
      // identical from here.
      shell: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web',
      standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
      // How long the browser took to get this far. The first number anybody
      // asks about a phone app, and it has never been recorded.
      ms: Math.round(performance.now()),
    })
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
  //
  // "Hidden" is not the same as "put away", which is what this actually
  // wants to know. Android reports hidden for things that are nothing of
  // the sort: a runtime permission dialog, the notification shade pulled
  // down, the app switcher previewing the card, the keyboard on some
  // skins. Reloading on the first hidden event therefore restarts the app
  // underneath somebody who never left it — which is exactly what it looked
  // like on David's phone. So wait, and only go through with it if the app
  // is still away. Reloading a hidden page is invisible, so the delay is
  // free.
  useEffect(() => {
    if (booting) return

    let timer = null

    function cancel() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    function reloadWhenAwayForGood() {
      if (document.visibilityState !== 'hidden') {
        cancel() // came straight back — a dialog or the shade, not a departure
        return
      }
      cancel()
      timer = setTimeout(() => {
        if (document.visibilityState !== 'hidden') return
        // Away for good, and the update is ready — but the app may still be
        // doing something. Two photographs were lost here: mid-upload,
        // switch apps for a moment, come back to a freshly booted app with
        // nothing to show for it. Nothing failed loudly; the upload simply
        // stopped existing, along with the screen that would have said so.
        //
        // Waiting costs nothing. Reloading a hidden page is invisible
        // either way, so the update can sit until the work is done and go
        // through the next time the phone is put down.
        if (busy()) {
          whenIdle(() => reloadWhenAwayForGood())
          return
        }
        window.location.reload()
      }, AWAY_BEFORE_RELOAD_MS)
    }

    function onUpdate() {
      document.addEventListener('visibilitychange', reloadWhenAwayForGood)
      // Already away when the update landed: still wait it out rather than
      // reloading on the spot, for the same reason.
      if (document.visibilityState === 'hidden') reloadWhenAwayForGood()
    }

    if (window.__pondSwUpdatePending) onUpdate()
    window.addEventListener('pond:sw-update', onUpdate)
    return () => {
      cancel()
      window.removeEventListener('pond:sw-update', onUpdate)
      document.removeEventListener('visibilitychange', reloadWhenAwayForGood)
    }
  }, [booting])

  useEffect(() => {
    // Told to the log first, so everything logged from here on — including
    // a crash — says which tab it happened on.
    nowLooking({ tab: activeTab })
    track('tab_view', { tab: activeTab })
  }, [activeTab])

  // Counted on every tab change rather than watched live: reviewing an import
  // is the only thing that clears it, and that always ends in a navigation.
  // RLS scopes this to the signed-in person's own forwards, so the badge is
  // never somebody else's queue.
  useEffect(() => {
    if (!user) {
      setPendingImports(0)
      return
    }
    let alive = true
    supabase
      .from('email_imports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => alive && setPendingImports(count ?? 0))
    return () => {
      alive = false
    }
  }, [user, activeTab])

  // Visits pile up on the device while the app is closed — including on the
  // background launches iOS does purely to deliver one — so the upload has
  // to happen on the way in, not on the way out.
  useEffect(() => {
    if (!user) return
    return installVisitSync()
  }, [user])

  // Recording follows the trips, not a switch you have to remember. Consent
  // is given once; the dates decide when it is actually on. Checked on every
  // launch and whenever the trips change, which is the only moment either
  // half of the question can have changed.
  useEffect(() => {
    if (!user || !visitsSupported()) return
    let alive = true
    ;(async () => {
      const status = await visitStatus()
      if (!alive || !status) return
      const act = nextAction({
        consented: hasConsented(),
        enabled: status.enabled,
        trips: tripMeta,
      })
      if (act === 'start') await enableVisits()
      if (act === 'stop') await disableVisits()
    })()
    return () => {
      alive = false
    }
  }, [user, tripMeta])

  // This used to pulse the bottom bar when you picked a trip, because the
  // trip's journal, map and photos were down there. They're in the sheet
  // that just opened instead, so pointing away from it would now be
  // actively wrong.
  useEffect(() => {
    if (activeTab !== 'world' || !selectedTrip) return
    nowLooking({ trip: selectedTrip })
    track('trip_select', { trip: selectedTrip })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrip, activeTab])

  function jumpToJournal(tripSlug, date) {
    setSelectedTrip(tripSlug)
    setActiveTab('journal')
    setJournalJump({ tripSlug, date, key: Date.now() })
  }

  // The example steps aside once you have trips of your own — computed once
  // here rather than at each consumer, or you get a demo that has left the
  // globe and is still in the trip picker.
  const shownTrips = useMemo(() => visibleTrips(tripMeta, demoPref), [tripMeta, demoPref])

  // Carry out the tap, once there is enough of the app to carry it out with.
  //
  // A push names a trip by id; the screens here are keyed on slug, and the
  // list that maps one to the other arrives over the network. So a tap that
  // launched the app cannot be acted on at the moment it is heard. It waits
  // here — deliberately without a timeout, because the alternative to
  // waiting is opening the wrong screen, and the trip list either arrives
  // or the app has bigger problems than a notification.
  useEffect(() => {
    if (!pushJump) return
    if (pushJump.go === 'tab') {
      setActiveTab(pushJump.tab)
      setPushJump(null)
      return
    }
    if (!tripsLoaded) return
    const trip = tripMeta.find((t) => t.id === pushJump.tripId)
    // Signed in as somebody else, or the trip has been deleted since. Drop
    // it rather than land them on an error.
    if (trip) {
      setSelectedTrip(trip.slug)
      // The look-back is its own sheet over whatever is showing, so it does
      // not need a tab underneath it — and forcing one would mean coming
      // back from the evening to a screen nobody chose.
      if (pushJump.go === 'lookBack') setLookBackJump({ tripId: trip.id, date: pushJump.date, title: trip.title })
      else setActiveTab('photos')
      track('push_opened', { go: pushJump.go })
    }
    setPushJump(null)
  }, [pushJump, tripsLoaded, tripMeta])

  const ctx = useMemo(
    () => ({
      tripMeta: shownTrips,
      allTrips: tripMeta,
      // Who is asking, for tabs to put in a dependency array. Restoring a
      // session is asynchronous, so any read fired at mount goes out before
      // the token exists and comes back answered as an anonymous request —
      // silently, because nothing failed. Every tab that reads private rows
      // keys on this so signing in refetches. Handed down here rather than
      // through useAuth in each tab so the next one written gets it for free.
      userId: user?.id ?? null,
      demoPref,
      setDemoPref: (v) => {
        writePreference(v)
        setDemoPref(v)
      },
      tripsLoaded,
      // Pull the trip list again without reloading the page. What making a
      // trip now does instead of throwing the whole app away.
      refreshTrips: loadTrips,
      // Bumped whenever photographs are added or removed. Anything showing
      // a count reads it, because several screens count photographs
      // independently and none of them could hear about a removal made on
      // another one — the recap sat on "459 photos" after a de-duplication
      // took it to 358, and the only way to correct it was to reload the
      // whole app.
      photosChanged,
      notePhotosChanged: () => setPhotosChanged((n) => n + 1),
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
        if (activeTab !== 'plan') plannerReturn.current = activeTab
        setActiveTab('plan')
      },
      clearPlannerJump: () => setPlannerJump(null),
      // The evening a notification opened, for the look-back to show. Held
      // on the context rather than passed down because the screen that
      // reads it is three levels below the tab that mounts it.
      lookBackJump,
      clearLookBackJump: () => setLookBackJump(null),
      // Called by PlanTab when the planner shuts. Puts you back where the
      // trip was tapped, so "back" means back.
      closePlanner: () => {
        const from = plannerReturn.current
        plannerReturn.current = null
        if (from) setActiveTab(from)
      },
      // Callers (the trip story card, mostly) ask for a destination by name
      // without knowing whether it sits in the bottom bar or under Useful.
      // Resolve that here so moving a tab between the two doesn't break
      // every jump link in the app.
      goToTab: (tab) => {
        if (USEFUL_ROUTES.some((t) => t.id === tab)) {
          setUsefulTab(tab)
          setActiveTab('useful')
        } else {
          setActiveTab(tab)
        }
      },
    }),
    [tripMeta, shownTrips, demoPref, tripsLoaded, selectedTrip, journalJump, plannerJump, lookBackJump, user?.id, photosChanged]
  )

  // Public read-only share page — no nav, no forms.
  if (SHOWCASE_TOKEN) return <ShowcaseView token={SHOWCASE_TOKEN} />

  if (SHARE_PARAMS) {
    return <ShareView slug={SHARE_PARAMS.slug} show={SHARE_PARAMS.show} />
  }

  return (
    <TripContext.Provider value={ctx}>
      {/* "What is this?" comes before "who are you?", and a signed-out
          visitor is exactly who most needs the answer. It used to be a card
          that came up after the opening and had to be dismissed; it is now
          the second half of the opening itself, so nobody has to agree to
          be told. */}
      {booting && <BootScreen leaving={bootLeaving} cold={meetsColdOpen} />}

      {/* What the nine o'clock notification opens. Over everything, because
          it was arrived at from outside the app and belongs to no tab. */}
      {lookBackJump && (
        <DayLookBack
          tripId={lookBackJump.tripId}
          date={lookBackJump.date}
          title={lookBackJump.title}
          onClose={() => setLookBackJump(null)}
        />
      )}

      <div className="app">
        <header className={`app-header${activeTab === 'world' ? ' app-header--world' : ''}`}>
          <button
            className={`header-duck-btn${user ? ' signed-in' : ''}`}
            onClick={() => {
              if (!user) return setAuthOpen(true)
              setUsefulTab('account')
              setActiveTab('useful')
            }}
            aria-label={user ? 'Account' : 'Sign in'}
            title={user ? user.email : 'Sign in'}
          >
            {/* A broken-image glyph is the worst thing to put where a logo
                goes: it says the app is broken, in the one place somebody
                looks to check that it isn't. Precaching makes a failure
                unlikely; hiding the element makes it survivable, because
                the button underneath keeps its shape and its purpose. */}
            <img
              className="header-duck"
              src="/duck.png"
              alt=""
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden'
              }}
            />
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
            dropdown asking you to pick again. Costs, Share and Flights keep
            the picker — they are per-trip too, and reached from a row rather
            than from a trip, so there is nothing to have come in from.
            //
            Flights was the omission, and it made a trap. The picker sets the
            app-wide selection; Flights reads that selection to filter by;
            and Flights showed no picker. So choosing Thailand in Costs and
            walking to Flights left it showing Thailand only, with nothing on
            the screen to say why or to undo it. A filter must never apply
            somewhere its control cannot be reached — the control is how you
            find out it is on. */}
        {TRIP_TABS.includes(activeTab) ? (
          <TripCrumb
            trip={shownTrips.find((t) => t.slug === selectedTrip)}
            onBack={() => setActiveTab('world')}
          />
        ) : activeTab === 'flights' ||
          (activeTab === 'useful' && (usefulTab === 'costs' || usefulTab === 'share')) ? (
          <TripPicker tripMeta={shownTrips} selectedTrip={selectedTrip} setSelectedTrip={setSelectedTrip} />
        ) : null}

        {/* On Account too, which it used to hide. Account is reached from the
            duck rather than from this row, so nothing in the row lights up —
            but a screen with no visible way off it is worse than a row with
            nothing selected, and "what is actually in here" should be
            answerable by looking. */}
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
              onClick={() => {
                // Useful remembers which section you were last in, which is
                // right for the four in the row and a trap for Account.
                // Account is the duck's destination, not one of the useful
                // things, and it hides the row that would let you leave — so
                // once you had opened it from the duck, tapping Useful took
                // you straight back to Settings for ever, with Costs,
                // Currency, Phrases and Share unreachable from anywhere.
                if (tab.id === 'useful' && usefulTab === 'account') setUsefulTab('costs')
                setActiveTab(tab.id)
              }}
            >
              <Icon name={tab.icon} size={22} className="navitem-i" />
              <span className="navitem-l">{tab.label}</span>
              {tab.id === 'plan' && pendingImports > 0 && (
                <span className="navitem-dot" aria-label={`${pendingImports} to review`} />
              )}
            </button>
          ))}
        </nav>
      </div>
    </TripContext.Provider>
  )
}
