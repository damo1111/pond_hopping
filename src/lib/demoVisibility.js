// When the example stops being helpful and starts being clutter.
//
// A demo trip earns its place on an empty globe — without it there is
// nothing to look at, and nothing to explain what a finished trip even
// looks like. The moment a real trip exists it becomes the opposite: a
// stranger's holiday sitting in your travel log, above your own, with
// costs and photos that aren't yours.
//
// So it leaves by itself. Not deleted — the demo is shared data, and other
// people are still being shown it — just not in your way any more.
//
// The switch is deliberately three-state rather than a boolean. "I have
// never touched this" has to be distinguishable from "I turned it off",
// because only the first is allowed to change its mind when your first real
// trip lands.

import { ownTrips } from './demoTour.js'

export const DEMO_PREF_KEY = 'pond:demo'

/** 'auto' until somebody decides otherwise. */
export function readPreference(store = globalThis.localStorage) {
  try {
    const v = store?.getItem(DEMO_PREF_KEY)
    return v === 'show' || v === 'hide' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function writePreference(value, store = globalThis.localStorage) {
  try {
    if (value === 'auto') store?.removeItem(DEMO_PREF_KEY)
    else store?.setItem(DEMO_PREF_KEY, value)
  } catch {
    /* a browser with storage switched off still gets the default */
  }
}

/**
 * Should the example be on screen?
 *
 * @param {{ trips?: Array<object>, pref?: 'auto'|'show'|'hide' }} state
 */
export function showDemo({ trips, pref = 'auto' } = {}) {
  if (pref === 'show') return true
  if (pref === 'hide') return false
  // Auto: it is there while it is the only thing there.
  return ownTrips(trips).length === 0
}

/**
 * True when the example is being hidden purely because real trips exist —
 * the case worth explaining, since the user never asked for it and might
 * wonder where Hong Kong went.
 */
export function hiddenByArrival({ trips, pref = 'auto' } = {}) {
  return pref === 'auto' && ownTrips(trips).length > 0
}

/** Everything the globe should actually draw. */
export function visibleTrips(trips, pref = 'auto') {
  const list = trips ?? []
  return showDemo({ trips: list, pref }) ? list : ownTrips(list)
}

/**
 * The line under the switch. It has to say what will happen, not what the
 * switch is called, because "Show example" is true of both states of a
 * toggle that hasn't been touched.
 */
export function demoSwitchNote({ trips, pref = 'auto' } = {}) {
  const real = ownTrips(trips).length
  if (pref === 'show') return 'Kept on screen alongside your own trips.'
  if (pref === 'hide') return 'Hidden. Your own trips only.'
  return real === 0
    ? 'Showing, because there is nothing else to show yet. It steps aside when you add a trip.'
    : 'Stepped aside now that you have trips of your own.'
}
