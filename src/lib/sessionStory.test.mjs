import test from 'node:test'
import assert from 'node:assert/strict'
import { A_GAP, gapAs, inShort, nameOf, weave, whatLedToIt } from './sessionStory.js'

const at = (s) => new Date(Date.parse('2026-08-15T10:00:00Z') + s * 1000).toISOString()

const SESSION = [
  { at: at(0), kind: 'did', what: 'app_open', detail: { tab: 'world' } },
  { at: at(4), kind: 'did', what: 'trip_select', detail: { trip: 'lisbon-porto' } },
  { at: at(200), kind: 'did', what: 'photos_import_started', detail: null },
  { at: at(203), kind: 'broke', what: '401 not connected to Google yet', detail: { kind: 'error' } },
  { at: at(240), kind: 'said', what: 'tapped google photos and nothing happened', detail: { platform: 'android' } },
]

test('three tables become one column of time', () => {
  // Handed to it deliberately out of order: the database unions them and the
  // ordering is this function's job, not the caller's.
  const story = weave([SESSION[3], SESSION[0], SESSION[4], SESSION[2], SESSION[1]])
  assert.deepEqual(
    story.map((r) => r.kind),
    ['did', 'did', 'did', 'broke', 'said'],
  )
  assert.deepEqual(
    story.map((r) => r.raw),
    ['app_open', 'trip_select', 'photos_import_started', '401 not connected to Google yet', 'tapped google photos and nothing happened'],
  )
})

test('events get sentences, and anything unnamed comes through as written', () => {
  assert.equal(nameOf('app_open'), 'Opened the app')
  assert.equal(nameOf('photos_import_started'), 'Started a photo import')
  // A wrong-but-confident label is worse than the raw string, and the raw
  // string is already readable. A new event announcing itself is the point.
  assert.equal(nameOf('some_event_nobody_has_named'), 'some_event_nobody_has_named')
})

test('what somebody said is never renamed', () => {
  const story = weave(SESSION)
  const said = story.find((r) => r.kind === 'said')
  assert.equal(said.what, 'tapped google photos and nothing happened')
  const broke = story.find((r) => r.kind === 'broke')
  assert.equal(broke.what, '401 not connected to Google yet')
})

test('the pauses are marked, because that is where somebody was stuck', () => {
  const story = weave(SESSION)
  assert.equal(story[0].since, null, 'the first line has nothing before it')
  assert.equal(story[1].since, 4000)
  assert.equal(story[1].paused, false)
  // 196 seconds between choosing a trip and starting an import: that is
  // somebody working out what to do, and it is usually what the report is
  // about.
  assert.equal(story[2].since, 196000)
  assert.equal(story[2].paused, true)
  assert.ok(A_GAP <= 196000)
})

test('gaps are said the way a person says them', () => {
  assert.equal(gapAs(4000), '4s')
  assert.equal(gapAs(130000), '2m 10s')
  assert.equal(gapAs(120000), '2m')
  assert.equal(gapAs(3900000), '1h 05m')
  assert.equal(gapAs(null), '')
})

test('the session summarises before you decide to open it', () => {
  const short = inShort(weave(SESSION))
  assert.equal(short.did, 3)
  assert.equal(short.broke, 1)
  assert.equal(short.said, 1)
  assert.equal(short.lasted, '4m')
  assert.equal(short.worrying, true, 'something broke — that is the reason to open it')
})

test('and a clean session is not flagged as worrying', () => {
  const short = inShort(weave(SESSION.filter((r) => r.kind !== 'broke')))
  assert.equal(short.broke, 0)
  assert.equal(short.worrying, false)
})

test('what led to the break is the question every report is really asking', () => {
  const led = whatLedToIt(weave(SESSION))
  assert.equal(led.broke.raw, '401 not connected to Google yet')
  assert.deepEqual(
    led.before.map((r) => r.raw),
    ['app_open', 'trip_select', 'photos_import_started'],
  )
})

test('and nothing is claimed when nothing broke', () => {
  assert.equal(whatLedToIt(weave(SESSION.filter((r) => r.kind !== 'broke'))), null)
  assert.equal(whatLedToIt([]), null)
})

test('rubbish rows are dropped rather than sorted into the middle', () => {
  // These arrive from three tables through a union. A row with no timestamp
  // sorts to an arbitrary place and silently rewrites the order of the
  // story, which is the one thing this function exists to get right.
  const story = weave([
    ...SESSION,
    null,
    { kind: 'did', what: 'no timestamp at all' },
    { at: 'not a date', kind: 'did', what: 'unparseable' },
  ])
  assert.equal(story.length, SESSION.length)
  assert.ok(!story.some((r) => r.raw === 'unparseable'))
})

test('an empty session is an empty story, not a crash', () => {
  assert.deepEqual(weave([]), [])
  assert.deepEqual(weave(), [])
  assert.equal(inShort([]).did, 0)
  assert.equal(inShort([]).lasted, '0s')
})
