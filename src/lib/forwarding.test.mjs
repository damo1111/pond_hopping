import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addressesFor, tidyAddress, withAddress, withoutAddress } from './forwarding.js'

test('an address pasted out of a mail client is still an address', () => {
  assert.equal(tidyAddress('David Moritz <david@moritznet.com>'), 'david@moritznet.com')
  assert.equal(tidyAddress('  David@Moritznet.com '), 'david@moritznet.com')
})

test('and something that is not one is refused rather than half-accepted', () => {
  assert.equal(tidyAddress('david'), null)
  assert.equal(tidyAddress('david@'), null)
  assert.equal(tidyAddress(''), null)
  assert.equal(tidyAddress(null), null)
})

test('the login address counts, without being an alias', () => {
  const from = addressesFor({ email_aliases: ['work@example.com'] }, { email: 'david@moritznet.com' })
  assert.deepEqual(from, ['david@moritznet.com', 'work@example.com'])
})

test('the same address twice is one address', () => {
  const from = addressesFor(
    { email: 'David@Moritznet.com', email_aliases: ['DAVID@moritznet.com', 'work@example.com'] },
    { email: 'david@moritznet.com' }
  )
  assert.deepEqual(from, ['david@moritznet.com', 'work@example.com'])
})

test('adding one already on the account changes nothing', () => {
  const profile = { email_aliases: ['work@example.com'] }
  const user = { email: 'david@moritznet.com' }
  assert.equal(withAddress(profile, user, 'david@moritznet.com'), null)
  assert.equal(withAddress(profile, user, 'WORK@example.com'), null)
  assert.equal(withAddress(profile, user, 'nonsense'), null)
})

test('adding a new one keeps the ones already there', () => {
  assert.deepEqual(
    withAddress({ email_aliases: ['work@example.com'] }, { email: 'd@x.com' }, 'Other <other@x.com>'),
    ['work@example.com', 'other@x.com']
  )
})

test('removing one leaves the rest, and removing nothing says so', () => {
  assert.deepEqual(withoutAddress({ email_aliases: ['a@x.com', 'b@x.com'] }, 'A@x.com'), ['b@x.com'])
  assert.equal(withoutAddress({ email_aliases: ['a@x.com'] }, 'c@x.com'), null)
  assert.equal(withoutAddress({ email_aliases: [] }, 'a@x.com'), null)
})
