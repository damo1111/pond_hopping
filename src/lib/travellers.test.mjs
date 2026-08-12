import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tidy, nameOf, canRemove, rowsOf, asNewMember, tenseFor } from './travellers.js'

const m = (id, email, extra = {}) => ({ id, email, role: 'viewer', is_traveller: false, ...extra })

test('nobody is nobody', () => {
  assert.deepEqual(tidy([]), [])
  assert.deepEqual(tidy(), [])
})

test('the owner comes first', () => {
  const out = tidy([
    m('1', 'zoe@example.com', { display_name: 'Zoe' }),
    m('2', 'dave@example.com', { role: 'owner', display_name: 'Dave' }),
  ])
  assert.deepEqual(out.map((x) => x.display_name), ['Dave', 'Zoe'])
})

// The table has duplicates in it, from an importer that inserted rather than
// upserted. A list showing the same person twice invites somebody to remove
// one and wonder why nothing changed.
test('the same person twice is one person', () => {
  const out = tidy([
    m('1', 'dave@example.com', { role: 'owner', display_name: 'Dave', is_traveller: true }),
    m('2', 'dave@example.com', { role: 'owner', display_name: null, is_traveller: false }),
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].display_name, 'Dave', 'the name that was recorded survives')
  assert.equal(out[0].is_traveller, true, 'and so does having travelled')
  assert.deepEqual(rowsOf(out[0]).sort(), ['1', '2'], 'removing takes both rows')
})

test('a duplicate keeps the strongest role', () => {
  const out = tidy([
    m('1', 'sam@example.com', { role: 'viewer' }),
    m('2', 'sam@example.com', { role: 'planner' }),
  ])
  assert.equal(out[0].role, 'planner')
  assert.equal(out[0].id, '2', 'and the id of the row it kept')
})

test('addresses match regardless of case or stray spaces', () => {
  const out = tidy([m('1', 'Sam@Example.com '), m('2', 'sam@example.com')])
  assert.equal(out.length, 1)
  assert.equal(out[0].email, 'sam@example.com')
})

test('a row with no address is not a person', () => {
  assert.deepEqual(tidy([m('1', ''), m('2', null)]), [])
})

test('somebody who is only ever an address still has something to call them', () => {
  assert.equal(nameOf({ email: 'seebyd@gmail.com' }), 'seebyd')
  assert.equal(nameOf({ email: 'seebyd@gmail.com', display_name: 'David Seeby' }), 'David Seeby')
  assert.equal(nameOf({ email: 'x@y.com', display_name: '   ' }), 'x')
})

// The trip would belong to nobody, and every policy on it keys off being an
// editor.
test('the owner cannot be removed', () => {
  assert.equal(canRemove({ role: 'owner' }), false)
  assert.equal(canRemove({ role: 'planner' }), true)
  assert.equal(canRemove(null), false)
})

test('a new companion is a traveller, not an editor', () => {
  const row = asNewMember('trip-1', ' Seebyd@Gmail.com ', ' David Seeby ')
  assert.deepEqual(row, {
    trip_id: 'trip-1',
    email: 'seebyd@gmail.com',
    display_name: 'David Seeby',
    role: 'viewer',
    is_traveller: true,
  })
})

test('a name is optional and an address is not', () => {
  assert.equal(asNewMember('t', 'a@b.com', '').display_name, null)
  assert.equal(asNewMember('t', 'not an address', 'X'), null)
  assert.equal(asNewMember('t', '', 'X'), null)
})

// "Who was there" on a trip that has not happened yet is wrong, and "0 of
// you" underneath it is worse.
test('a trip in the future is asked about in the future', () => {
  const t = tenseFor({ start_date: '2026-10-09', end_date: '2026-10-15' }, '2026-08-12')
  assert.equal(t.when, 'future')
  assert.equal(t.title, "Who's coming")
  assert.equal(t.came, 'coming')
})

test('a trip that has been is asked about in the past', () => {
  const t = tenseFor({ start_date: '2026-04-03', end_date: '2026-04-10' }, '2026-08-12')
  assert.equal(t.when, 'past')
  assert.equal(t.title, 'Who was there')
})

test('a trip happening right now is neither', () => {
  const t = tenseFor({ start_date: '2026-08-10', end_date: '2026-08-14' }, '2026-08-12')
  assert.equal(t.when, 'now')
  assert.match(t.title, /on this trip/)
})

test('the last day of a trip is still the trip', () => {
  assert.equal(tenseFor({ start_date: '2026-08-01', end_date: '2026-08-12' }, '2026-08-12').when, 'now')
  assert.equal(tenseFor({ start_date: '2026-08-01', end_date: '2026-08-11' }, '2026-08-12').when, 'past')
})

// A trip started with no end date — "I'm off now" — is happening, not over.
test('a trip with a start and no end is not in the past', () => {
  assert.equal(tenseFor({ start_date: '2026-08-10', end_date: null }, '2026-08-12').when, 'now')
})

test('no dates at all reads as ahead rather than behind', () => {
  assert.equal(tenseFor({}, '2026-08-12').when, 'future')
  assert.equal(tenseFor(null, '2026-08-12').when, 'future')
})

test('every tense has all its words', () => {
  for (const t of [
    tenseFor({ start_date: '2020-01-01', end_date: '2020-01-02' }, '2026-08-12'),
    tenseFor({ start_date: '2026-08-10', end_date: '2026-08-14' }, '2026-08-12'),
    tenseFor({ start_date: '2030-01-01', end_date: '2030-01-02' }, '2026-08-12'),
  ]) {
    assert.ok(t.title && t.came && t.didnt && t.add && t.none, t.when)
  }
})
