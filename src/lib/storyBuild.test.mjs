import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GONE_QUIET_MS, howItWent, newQuestions, running, whatThereIs } from './storyBuild.js'

const NOW = new Date('2026-08-11T12:00:00Z')
const ago = (ms) => new Date(NOW.valueOf() - ms).toISOString()

// The case this whole file exists for: six trips imported from a Google
// Timeline, with a journal entry on nearly every day and not one photograph.
// The component that used to decide this returned null on !photos.length, so
// they had no story and no way to ask for one.
test('a trip with no photographs but a recorded day is worth writing', () => {
  const have = whatThereIs({
    photos: [],
    tracks: [{ track_date: '2026-04-03', visits: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }] }],
    entries: [{ entry_date: '2026-04-03', note: 'Landed in Bangkok.' }],
  })
  assert.equal(have.photographs, 0)
  assert.equal(have.stays, 2)
  assert.equal(have.said, 1)
  assert.equal(have.days, 1)
  assert.equal(have.enough, true)
})

test('a trip with nothing recorded at all is not', () => {
  assert.equal(whatThereIs({}).enough, false)
  // An entry this system wrote itself is not testimony and does not count.
  assert.equal(
    whatThereIs({ entries: [{ entry_date: '2026-04-03', note: 'Pieced together.', built_from: { photos: 4 } }] })
      .enough,
    false
  )
})

test('a flight on its own is enough of a day to write about', () => {
  assert.equal(whatThereIs({ flights: [{ flight_number: 'BA115' }] }).enough, true)
  assert.equal(whatThereIs({ runs: [{ run_date: '2026-04-03' }] }).enough, true)
})

test('unread counts the photographs this stage cannot use', () => {
  const have = whatThereIs({
    photos: [
      { url: 'a', seen: { subject: 'a plate' } },
      { url: 'b' },
      { url: 'c', kind: 'receipt' },
      { seen: null },
    ],
  })
  assert.equal(have.photographs, 4)
  // The receipt is not for the seeing pass, and the row with no url cannot
  // be looked at by anything.
  assert.equal(have.unread, 1)
})

test('a run that has not said anything for a quarter of an hour is not running', () => {
  assert.equal(running({ started_at: ago(60_000) }, { now: NOW }), true)
  assert.equal(running({ started_at: ago(GONE_QUIET_MS + 1000) }, { now: NOW }), false)
})

test('a finished run is not running, however recently it finished', () => {
  assert.equal(running({ started_at: ago(1000), finished_at: ago(500) }, { now: NOW }), false)
  assert.equal(running(null, { now: NOW }), false)
})

test('a question already on the table is not filed again', () => {
  const existing = [{ asks: 'What were you doing in Piazza Navona for the final hour?', on_date: '2024-01-23' }]
  const out = newQuestions(existing, [
    { asks: 'What occupied you in Piazza Navona during that last hour?', on_date: '2024-01-23' },
    { asks: 'Where did you eat on the first evening?', on_date: '2024-01-22' },
  ])
  assert.equal(out.length, 1)
  assert.match(out[0].asks, /Where did you eat/)
})

// One run can produce two wordings of one question, and filing both is the
// same failure as filing a repeat of last week's.
test('two versions of one question in the same batch file once', () => {
  const out = newQuestions([], [
    { asks: 'What was the flight over Scotland before you reached Heathrow?' },
    { asks: 'What flight brought you over Scotland and into Heathrow?' },
  ])
  assert.equal(out.length, 1)
})

test('a question with no text is not a question', () => {
  assert.deepEqual(newQuestions([], [{ because: 'a gap' }, null, { asks: '' }]), [])
})

test('how it went distinguishes written from asked from unread', () => {
  assert.equal(howItWent({ chapters: 1 }), '1 day written')
  assert.equal(
    howItWent({ chapters: 16, asked: 3, unread: 12 }),
    '16 days written, 3 new questions, 12 photographs still unread'
  )
})
