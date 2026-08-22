import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daysIn, tripSoFar } from './tripSoFar.js'

test('it says how far in, in words rather than in figures', () => {
  // "Day 3 of 10" is already the caption above this. Repeating it in prose is
  // how a screen starts sounding like a form.
  assert.equal(daysIn(1), 'First day')
  assert.equal(daysIn(3), 'Three days in')
  assert.equal(daysIn(6), 'Six days in')
})

test('and past ten it stops spelling and uses the number', () => {
  // "Fourteen days in" is not more readable than "14 days in", it is just
  // longer — and the word list would have to grow forever.
  assert.equal(daysIn(14), '14 days in')
})

test('a full line reads as a sentence', () => {
  assert.equal(
    tripSoFar({ day: 3, photos: 42, flights: 2 }),
    'Three days in. 42 photos and 2 flights.'
  )
})

test('and the list grows properly rather than by commas', () => {
  assert.equal(
    tripSoFar({ day: 6, photos: 59, flights: 5, countries: 2, unbooked: 3 }),
    'Six days in. 59 photos, 5 flights, 2 countries and 3 nights with nowhere to sleep.'
  )
})

test('one country is not a fact about a trip', () => {
  // It is a fact about every trip. Thailand saying "1 country" reads as the
  // app counting for the sake of counting.
  assert.equal(tripSoFar({ day: 6, photos: 59, countries: 1 }), 'Six days in. 59 photos.')
  assert.ok(/2 countries/.test(tripSoFar({ day: 6, photos: 59, countries: 2 })))
})

test('nothing is ever reported as a zero', () => {
  // "First day. 0 photos and 0 places" is worse than a shorter sentence: it
  // reads as the app being disappointed in somebody who has just arrived.
  assert.equal(tripSoFar({ day: 1, photos: 0, flights: 0, countries: 0 }), 'First day.')
  assert.ok(!/\b0\b/.test(tripSoFar({ day: 2, photos: 0, flights: 3, unbooked: 0 })))
})

test('and nowhere-to-sleep is only mentioned when it is true', () => {
  // The one clause here that is only worth saying when the answer is bad.
  assert.ok(!/sleep/.test(tripSoFar({ day: 3, photos: 10, flights: 2, unbooked: 0 })))
  assert.ok(!/sleep/.test(tripSoFar({ day: 3, photos: 10, flights: 2, unbooked: null })))
  assert.ok(/1 night with nowhere to sleep/.test(tripSoFar({ day: 3, photos: 10, unbooked: 1 })))
})

test('one of anything is singular', () => {
  assert.equal(tripSoFar({ day: 1, photos: 1, flights: 1 }), 'First day. 1 photo and 1 flight.')
})

test('a trip that has not started says nothing at all', () => {
  // Rather than a shrug. tripProgress hands back day 0 for a trip with no
  // start date, and a summary of a trip nobody is on yet is not a sentence
  // worth writing.
  assert.equal(tripSoFar({ day: 0, photos: 12 }), null)
  assert.equal(tripSoFar({}), null)
  assert.equal(tripSoFar(), null)
  assert.equal(daysIn(0), null)
  assert.equal(daysIn(null), null)
})
