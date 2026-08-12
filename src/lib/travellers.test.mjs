import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tidy, nameOf, canRemove, rowsOf, asNewMember } from './travellers.js'

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
