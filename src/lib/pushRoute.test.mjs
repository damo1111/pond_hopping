import { test } from 'node:test'
import assert from 'node:assert/strict'
import { whereTo, whereToFromTap, TABS } from './pushRoute.js'

const TRIP = '11111111-2222-3333-4444-555555555555'

test('a finished story opens that trip', () => {
  assert.deepEqual(whereTo({ kind: 'story_ready', trip_id: TRIP }), { go: 'trip', tripId: TRIP })
})

// The push is the payoff for a wait measured in minutes. Dropping somebody
// on the tab they were last on is the same as not sending it.
test('a finished story with no trip on it still goes somewhere', () => {
  assert.deepEqual(whereTo({ kind: 'story_ready' }), { go: 'tab', tab: 'world' })
})

test('the evening look-back opens that evening, not tonight', () => {
  assert.deepEqual(whereTo({ kind: 'look_back', trip_id: TRIP, on_date: '2026-08-11' }), {
    go: 'lookBack',
    tripId: TRIP,
    date: '2026-08-11',
  })
})

test('a look-back missing its date is not a look-back', () => {
  assert.equal(whereTo({ kind: 'look_back', trip_id: TRIP }), null)
  assert.equal(whereTo({ kind: 'look_back', trip_id: TRIP, on_date: 'yesterday' }), null)
})

test('a forwarded booking goes to the tab that reviews it', () => {
  assert.deepEqual(whereTo({ kind: 'email_import', tab: 'plan' }), { go: 'tab', tab: 'plan' })
})

// FCM stringifies every value in `data` and APNs does not, so both roads
// have to land in the same place.
test('the same notification down either road routes the same', () => {
  const apple = { kind: 'story_ready', trip_id: TRIP }
  const google = { kind: 'story_ready', trip_id: TRIP, silent: 'false' }
  assert.deepEqual(whereTo(apple), whereTo(google))
})

// You have to be able to push to this device to get here, so this is not
// really an attack surface — but it decides what opens, so it is checked.
test('a trip id that is not one is refused', () => {
  for (const bad of ['undefined', 'null', '', '../admin', 42, null, { id: TRIP }]) {
    assert.deepEqual(whereTo({ kind: 'story_ready', trip_id: bad }), { go: 'tab', tab: 'world' }, String(bad))
  }
})

test('a tab that does not exist is not opened', () => {
  assert.equal(whereTo({ kind: 'email_import', tab: 'admin' }).tab, 'plan', 'falls back rather than obeys')
  assert.equal(whereTo({ tab: 'nonsense' }), null)
})

test('every tab it will open is one the app has', () => {
  for (const tab of TABS) assert.deepEqual(whereTo({ tab }), { go: 'tab', tab })
})

// A newer server sending a kind this build has never heard of must not
// crash it, and must not guess.
test('an unknown kind is ignored rather than guessed at', () => {
  assert.equal(whereTo({ kind: 'something_new_in_2027', trip_id: TRIP }), null)
  assert.deepEqual(whereTo({ kind: 'something_new', tab: 'photos' }), { go: 'tab', tab: 'photos' })
})

test('nothing at all is nowhere to go, not a crash', () => {
  for (const nothing of [null, undefined, '', 0, 'a string', []]) {
    assert.doesNotThrow(() => whereTo(nothing), String(nothing))
    assert.equal(whereTo(nothing), null, String(nothing))
  }
})

// The admin push has no screen behind it. Opening the app is the intent.
test('the signup ping has nowhere to be', () => {
  assert.equal(whereTo({ kind: 'new_signup', email: 'someone@example.com' }), null)
})

// Capacitor wraps the payload one layer deeper on a tap than on a receive,
// and getting that wrong is a silent nothing-happens rather than an error.
test('both of Capacitor’s shapes are unwrapped', () => {
  const want = { go: 'trip', tripId: TRIP }
  assert.deepEqual(whereToFromTap({ notification: { data: { kind: 'story_ready', trip_id: TRIP } } }), want)
  assert.deepEqual(whereToFromTap({ data: { kind: 'story_ready', trip_id: TRIP } }), want)
  assert.equal(whereToFromTap({}), null)
  assert.equal(whereToFromTap(undefined), null)
})
