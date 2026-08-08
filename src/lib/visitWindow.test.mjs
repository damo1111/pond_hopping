import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EDGE_DAYS,
  OPEN_ENDED_DAYS,
  activeTrips,
  nextAction,
  recordingStatus,
  shouldRecord,
} from './visitWindow.js'

const NOW = Date.parse('2026-03-15T09:00:00Z')
const trip = (start, end, extra = {}) => ({ title: 'A trip', start_date: start, end_date: end, ...extra })

test('a trip covering today is active', () => {
  assert.equal(activeTrips([trip('2026-03-10', '2026-03-20')], NOW).length, 1)
})

test('trips either side of today are not', () => {
  assert.equal(activeTrips([trip('2026-01-01', '2026-01-09')], NOW).length, 0)
  assert.equal(activeTrips([trip('2026-06-01', '2026-06-09')], NOW).length, 0)
})

// Travel days are the ones most worth recording and the ones most likely to
// fall outside the dates somebody typed in a hurry.
test('the day either side of a trip counts', () => {
  assert.equal(activeTrips([trip('2026-03-16', '2026-03-20')], NOW).length, 1)
  assert.equal(activeTrips([trip('2026-03-01', '2026-03-14')], NOW).length, 1)
  assert.equal(EDGE_DAYS, 1)
})

test('two days out is out', () => {
  assert.equal(activeTrips([trip('2026-03-17', '2026-03-20')], NOW).length, 0)
})

test('a trip with no end date is one you are still on', () => {
  assert.equal(activeTrips([trip('2026-03-10', null)], NOW).length, 1)
})

// The failure that would actually hurt: an open-ended draft from years ago
// keeping background location on indefinitely.
test('an open-ended trip does not stay open forever', () => {
  const old = new Date(NOW - (OPEN_ENDED_DAYS + 10) * 86400000).toISOString().slice(0, 10)
  assert.equal(activeTrips([trip(old, null)], NOW).length, 0)
})

test('drafts and undated trips never trigger recording', () => {
  assert.equal(activeTrips([trip('2026-03-10', '2026-03-20', { status: 'draft' })], NOW).length, 0)
  assert.equal(activeTrips([trip(null, null)], NOW).length, 0)
  assert.equal(activeTrips([{}], NOW).length, 0)
  assert.equal(activeTrips(undefined, NOW).length, 0)
})

// Consent and schedule are independent on purpose: neither implies the other.
test('consent alone does not record, and a trip alone does not either', () => {
  const trips = [trip('2026-03-10', '2026-03-20')]
  assert.equal(shouldRecord({ consented: true, trips, now: NOW }), true)
  assert.equal(shouldRecord({ consented: false, trips, now: NOW }), false)
  assert.equal(shouldRecord({ consented: true, trips: [], now: NOW }), false)
  assert.equal(shouldRecord({}), false)
})

test('the next action is only ever the change that is needed', () => {
  const on = [trip('2026-03-10', '2026-03-20')]
  assert.equal(nextAction({ consented: true, enabled: false, trips: on, now: NOW }), 'start')
  assert.equal(nextAction({ consented: true, enabled: true, trips: on, now: NOW }), null)
  assert.equal(nextAction({ consented: true, enabled: true, trips: [], now: NOW }), 'stop')
  assert.equal(nextAction({ consented: false, enabled: true, trips: on, now: NOW }), 'stop')
  assert.equal(nextAction({ consented: false, enabled: false, trips: on, now: NOW }), null)
})

// "Off because you're not travelling" and "off because you said no" look
// identical on a switch and mean entirely different things.
test('the status distinguishes the two ways of being off', () => {
  assert.match(recordingStatus({ consented: false, now: NOW }).note, /only noted if you ask/)
  const idle = recordingStatus({ consented: true, trips: [], now: NOW })
  assert.equal(idle.on, false)
  assert.match(idle.note, /wakes up when a trip starts/)
})

test('when it is recording it says which trip put it there', () => {
  const s = recordingStatus({ consented: true, trips: [trip('2026-03-10', '2026-03-20', { title: 'Lisbon' })], now: NOW })
  assert.equal(s.on, true)
  assert.match(s.note, /Lisbon/)
})

test('two overlapping trips are named without running on', () => {
  const s = recordingStatus({
    consented: true,
    now: NOW,
    trips: [
      trip('2026-03-10', '2026-03-20', { title: 'Lisbon' }),
      trip('2026-03-14', '2026-03-16', { title: 'Porto' }),
      trip('2026-03-12', '2026-03-18', { title: 'Sintra' }),
    ],
  })
  assert.match(s.note, /Lisbon and Porto/)
  assert.doesNotMatch(s.note, /Sintra/)
})
