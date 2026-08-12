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
export default class Boundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
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
