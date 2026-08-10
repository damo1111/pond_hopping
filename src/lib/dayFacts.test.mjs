import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factsFor, voiceFrom } from './dayFacts.js'

const ROME = 'Europe/Rome'

const day = {
  date: '2024-01-23',
  day_number: 2,
  from: '2024-01-23T06:06:00Z',
  to: '2024-01-23T20:14:00Z',
  photos: new Array(122),
  known: {
    runs: [{ sport: 'run', distance_km: '21.39', pace: '4:50', elevation_m: 178 }],
    flights: [],
  },
  segments: [
    { from: '2024-01-23T06:06:00Z', to: '2024-01-23T06:50:00Z', minutes: 44, stayed: true, photos: new Array(28) },
    { from: '2024-01-23T07:51:00Z', to: '2024-01-23T07:52:00Z', minutes: 2, stayed: false, photos: new Array(6) },
    { from: '2024-01-23T12:16:00Z', to: '2024-01-23T14:10:00Z', minutes: 114, stayed: true, photos: new Array(58) },
  ],
}

test('the facts are the trip’s own times, not the reader’s', () => {
  const f = factsFor(day, { 0: 'Circo Massimo', 2: 'the Roman Forum' }, ROME)
  assert.equal(f.stops[0].from, '07:06')
  assert.equal(f.stops[1].from, '13:16')
  assert.equal(f.first_photo, '07:06')
})

test('the run is in there with everything a runner would say', () => {
  const f = factsFor(day, {}, ROME)
  assert.deepEqual(f.activities, [{ kind: 'run', km: 21.39, pace: '4:50', climb_m: 178 }])
})

test('places you passed are counted, not listed', () => {
  const f = factsFor(day, {}, ROME)
  assert.equal(f.stops.length, 2)
  assert.equal(f.passing, 1)
})

test('a stop nothing could name is still a stop', () => {
  // Told that it happened and that nothing is known about it, which is
  // more honest than dropping it and pretending the day had two stops.
  const f = factsFor(day, { 0: 'Circo Massimo' }, ROME)
  assert.equal(f.stops[1].place, null)
  assert.equal(f.stops[1].minutes, 114)
})

test('voice comes from what they wrote, never from what we wrote', () => {
  // A reconstruction is this system's own voice. Feeding it back would
  // teach it to imitate itself, and every entry would drift towards the
  // same shape.
  const entries = [
    { entry_date: '2024-01-22', note: 'Flew Edinburgh to London to Rome, guested into the Concorde Room and got chatting to a Scottish couple.' },
    { entry_date: '2024-01-25', note: 'Early flight home — Rome to London to Edinburgh, and back at the desk by lunchtime.', built_from: null },
    { entry_date: '2024-01-24', note: 'First thing at Villa Doria Pamphili, from 07:17. The longest stop was Piazza Navona.', built_from: { photos: 3 } },
  ]
  const voice = voiceFrom(entries)
  assert.equal(voice.length, 2)
  assert.ok(voice.every((v) => !v.includes('The longest stop')))
})

test('and never from the day being written', () => {
  const entries = [{ entry_date: '2024-01-23', note: 'A'.repeat(80) }]
  assert.deepEqual(voiceFrom(entries, '2024-01-23'), [])
})

test('a one-line entry teaches nothing about how somebody writes', () => {
  assert.deepEqual(voiceFrom([{ entry_date: '2024-01-22', note: 'Home early.' }]), [])
})
