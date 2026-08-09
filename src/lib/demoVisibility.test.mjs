import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEMO_PREF_KEY,
  demoSwitchNote,
  hiddenByArrival,
  readPreference,
  showDemo,
  visibleTrips,
  writePreference,
} from './demoVisibility.js'

const demo = { id: 'd', title: 'HK & South Korea', is_demo: true }
const mine = (title) => ({ id: title, title })

// A tiny stand-in rather than the real thing, so the rule is testable
// without a browser and the failure modes of storage are testable at all.
function fakeStore(initial = {}, { throws = false } = {}) {
  const data = { ...initial }
  return {
    getItem: (k) => {
      if (throws) throw new Error('storage disabled')
      return k in data ? data[k] : null
    },
    setItem: (k, v) => {
      if (throws) throw new Error('storage disabled')
      data[k] = v
    },
    removeItem: (k) => {
      if (throws) throw new Error('storage disabled')
      delete data[k]
    },
    _data: data,
  }
}

test('the example shows while it is the only thing there', () => {
  assert.equal(showDemo({ trips: [demo] }), true)
  assert.equal(showDemo({ trips: [] }), true)
})

test('the example steps aside the moment a real trip exists', () => {
  assert.equal(showDemo({ trips: [demo, mine('Lisbon')] }), false)
})

// The whole reason the preference is three-state: "never touched" has to be
// able to change its mind, and an explicit choice must not be overruled.
test('an explicit choice outranks the arrival of real trips, both ways', () => {
  assert.equal(showDemo({ trips: [demo, mine('Lisbon')], pref: 'show' }), true)
  assert.equal(showDemo({ trips: [demo], pref: 'hide' }), false)
})

test('only an untouched switch is described as having stepped aside', () => {
  assert.equal(hiddenByArrival({ trips: [demo, mine('Lisbon')] }), true)
  assert.equal(hiddenByArrival({ trips: [demo] }), false)
  assert.equal(hiddenByArrival({ trips: [demo, mine('Lisbon')], pref: 'hide' }), false)
})

test('hiding the example removes it from the list rather than reordering it', () => {
  const all = [demo, mine('Lisbon')]
  assert.deepEqual(visibleTrips(all, 'auto').map((t) => t.title), ['Lisbon'])
  assert.equal(visibleTrips(all, 'show').length, 2)
  assert.deepEqual(visibleTrips([demo], 'auto'), [demo])
  assert.deepEqual(visibleTrips(undefined, 'auto'), [demo].slice(0, 0))
})

test('the preference round-trips, and clears back to auto', () => {
  const store = fakeStore()
  assert.equal(readPreference(store), 'auto')
  writePreference('hide', store)
  assert.equal(store._data[DEMO_PREF_KEY], 'hide')
  assert.equal(readPreference(store), 'hide')
  writePreference('auto', store)
  assert.equal(DEMO_PREF_KEY in store._data, false)
  assert.equal(readPreference(store), 'auto')
})

test('rubbish in storage reads as auto rather than as a decision', () => {
  assert.equal(readPreference(fakeStore({ [DEMO_PREF_KEY]: 'yes please' })), 'auto')
  assert.equal(readPreference(fakeStore({}, { throws: true })), 'auto')
})

test('storage that refuses to write does not throw', () => {
  assert.doesNotThrow(() => writePreference('hide', fakeStore({}, { throws: true })))
  assert.doesNotThrow(() => writePreference('hide', undefined))
})

test('the note says what will happen, not what the switch is called', () => {
  assert.match(demoSwitchNote({ trips: [demo] }), /nothing else to show yet/)
  assert.match(demoSwitchNote({ trips: [demo, mine('Lisbon')] }), /stepped aside/i)
  assert.match(demoSwitchNote({ trips: [demo], pref: 'show' }), /alongside/)
  assert.match(demoSwitchNote({ trips: [demo], pref: 'hide' }), /Hidden/)
})

test('somebody else\'s public trip does not count as one of yours', () => {
  // Rome is public so the work group can see it. Without this, every
  // visitor on earth "has a trip", the example steps aside, and a first
  // launch is one stranger's holiday with nothing to explain it.
  const theirs = { title: 'Rome', is_demo: false, mine: false }
  const demo = { title: 'HK & South Korea', is_demo: true, mine: false }

  assert.equal(showDemo({ trips: [theirs, demo] }), true)
  assert.deepEqual(visibleTrips([theirs, demo]).map((t) => t.title), ['Rome', 'HK & South Korea'])
  assert.equal(hiddenByArrival({ trips: [theirs, demo] }), false)
})

test('your own trip still sends the example away', () => {
  const mine = { title: 'Samoa', is_demo: false, mine: true }
  const theirs = { title: 'Rome', is_demo: false, mine: false }
  const demo = { title: 'HK & South Korea', is_demo: true, mine: true }

  assert.equal(showDemo({ trips: [mine, theirs, demo] }), false)
  assert.deepEqual(visibleTrips([mine, theirs, demo]).map((t) => t.title), ['Samoa'])
  assert.equal(hiddenByArrival({ trips: [mine, theirs, demo] }), true)
})
