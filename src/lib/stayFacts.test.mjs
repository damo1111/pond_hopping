import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noteWorthShowing, stayFacts } from './stayFacts.js'

test('an imported Airbnb reads as facts rather than soup', () => {
  assert.deepEqual(
    stayFacts({ confirmation: 'HM3BCPYMNX', nights: 4, guests: 4, host: 'Harebell Cottages' }),
    ['4 nights', '4 guests', 'Host: Harebell Cottages', 'HM3BCPYMNX']
  )
})

test('hand-entered stays use their own keys and still work', () => {
  // These rows predate the imported shape; reading both beats migrating
  // data that is doing no harm.
  assert.deepEqual(stayFacts({ nights: 2, total_gbp: 497 }), ['2 nights', '£497'])
})

test('singular and plural are both right', () => {
  assert.deepEqual(stayFacts({ nights: 1, guests: 1 }), ['1 night', '1 guest'])
})

test('breakfast only appears when it is included', () => {
  assert.deepEqual(stayFacts({ breakfast: true }), ['Breakfast included'])
  assert.deepEqual(stayFacts({ breakfast: false }), [])
})

test('a total that arrived as text keeps its own currency', () => {
  assert.deepEqual(stayFacts({ total: '€310.00' }), ['€310.00'])
})

test('nothing known is no facts, not a row of blanks', () => {
  assert.deepEqual(stayFacts({}), [])
  assert.deepEqual(stayFacts(), [])
  assert.deepEqual(stayFacts({ imported: true, source_subject: 'x' }), [])
})

test('zero is not treated as a value worth printing', () => {
  assert.deepEqual(stayFacts({ nights: 0, guests: 0 }), [])
})

test('the note is shown only when there are no facts to replace it', () => {
  assert.equal(noteWorthShowing('Some free text', {}), true)
  assert.equal(noteWorthShowing('Confirmation code: HM3BCPYMNX; 4 beds', { nights: 4 }), false)
  assert.equal(noteWorthShowing('', { nights: 4 }), false)
  assert.equal(noteWorthShowing(null, {}), false)
})
