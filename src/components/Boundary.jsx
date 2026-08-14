import { Component } from 'react'
import { oops, track } from '../lib/analytics.js'

// The app had no error boundary at all. Any exception thrown while rendering
// unmounted the entire tree, leaving a blank page with no message, no reload
// and — in a Capacitor shell with no address bar — no way out at all. "It
// won't open" is what that looks like from the outside, and it says nothing
// about what actually broke.
//
// This does three things a blank page cannot: it says something failed, it
// says what, and it offers a way back that is more than "try again" — because
// the failure that strands someone is usually persisted state (a half-written
// session, a stale precached bundle after a deploy), and reloading into the
// same state just fails again.
/**
 * The shape of a lazily-imported file that is no longer on the server.
 *
 * Every engine words it differently, so this matches on all of them rather
 * than on whichever browser it was first seen in.
 */
const staleChunk = (error) =>
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|chunkloaderror/i.test(
    String(error?.message ?? '')
  )

/** Once per page session. sessionStorage, so a genuine reload loop cannot
 *  outlive the tab, and a real crash tomorrow is still reported. */
const TRIED = 'pond.freshened'
const alreadyTried = () => {
  try {
    return sessionStorage.getItem(TRIED) === '1'
  } catch {
    // No storage, no guard, and a reload loop is worse than a duck.
    return true
  }
}
const markTried = () => {
  try {
    sessionStorage.setItem(TRIED, '1')
  } catch {
    /* handled by alreadyTried returning true */
  }
}

/** Drop the worker and its caches, then come back on the current build. */
async function freshen() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
    await Promise.all(regs.map((r) => r.unregister()))
    const keys = (await caches?.keys?.()) || []
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch {
    /* a reload on its own still usually does it */
  }
  window.location.reload()
}

export default class Boundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // A chunk that is no longer there is not a crash — it is a deploy.
    //
    // The app is code-split, so a tab is fetched when it is opened. Ship a
    // new build while somebody has the old index.html cached and the hashed
    // file it asks for has gone: "Failed to fetch dynamically imported
    // module: .../WorldTab-Dh69l7R3.js". Nothing is broken. The page they
    // are holding is simply out of date, and every tester will meet this
    // every time anything ships.
    //
    // So take the old bundle away and come back with the new one, rather
    // than showing somebody a duck and asking them to press Reload. Once
    // only: if it happens again straight afterwards the cause is not a
    // deploy, and a screen that says so beats a reload loop.
    if (staleChunk(error) && !alreadyTried()) {
      markTried()
      freshen()
      return
    }

    // Still the console, because that is what you read with the device in
    // your hand.
    console.error('Pond Hopping crashed:', error, info?.componentStack)
    // And now somewhere else as well. This screen showed on every load of
    // the app for hours on 11 August and nothing anywhere recorded that it
    // had happened: the reason went to a console on somebody else's phone.
    // The component stack travels with it, because for a render crash
    // "which component" is most of the answer.
    oops('crash', error, info?.componentStack)
  }

  // Everything a reload alone would not shift: the stored session, the
  // service worker holding an old bundle, and its caches.
  async reset() {
    // Somebody reaching for this was stuck enough to throw their session
    // away, which is a stronger signal than the crash on its own.
    track('crash_reset', { why: String(this.state.error?.message ?? '').slice(0, 200) })
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('sb-') || k.startsWith('pond:')) localStorage.removeItem(k)
      }
    } catch {
      // A browser that won't let us touch storage still gets the reload.
    }
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
      await Promise.all(regs.map((r) => r.unregister()))
      const keys = (await caches?.keys?.()) || []
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch {
      // Same.
    }
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash">
        <img className="crash-duck" src="/duck.png" alt="" />
        <div className="crash-title">That didn’t work</div>
        <div className="crash-body">
          Something went wrong drawing the app. Your trips are safe — this is the screen, not the
          data.
        </div>
        <pre className="crash-detail">{String(error?.message || error)}</pre>
        <button className="crash-btn" onClick={() => window.location.reload()}>
          Reload
        </button>
        <button className="crash-btn crash-btn--quiet" onClick={() => this.reset()}>
          Sign out and clear this device
        </button>
        <div className="crash-build">
          build {typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}
        </div>
      </div>
    )
  }
}
