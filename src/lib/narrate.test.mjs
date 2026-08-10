import { test } from 'node:test'
import assert from 'node:assert/strict'
import { howLong, partOfDay, tellDay, titleDay } from './narrate.js'

// Times are built as local so the assertions match what a reader sees.
const at = (h, m = 0) => new Date(2024, 0, 23, h, m).toISOString()

const stop = (fromH, toH, minutes) => ({ from: at(fromH), to: at(toH), minutes })
const day = (stops) => ({ day_number: 2, stops, from: stops[0].from, to: stops[stops.length - 1].to })

test('when is said the way people say it', () => {
  assert.equal(partOfDay(at(7)), 'early')
  assert.equal(partOfDay(at(10)), 'the morning')
  assert.equal(partOfDay(at(13)), 'the middle of the day')
  assert.equal(partOfDay(at(15)), 'the afternoon')
  assert.equal(partOfDay(at(18)), 'the evening')
  assert.equal(partOfDay(at(22)), 'the night')
})

test('how long is said the way people say it', () => {
  assert.equal(howLong(40), '40 minutes')
  assert.equal(howLong(60), 'an hour')
  assert.equal(howLong(92), 'an hour and a half')
  assert.equal(howLong(140), '2.3 hours')
  assert.equal(howLong(300), '5 hours')
  assert.equal(howLong(0), null)
  assert.equal(howLong(undefined), null)
})

test('a named day reads as a day, not as a row count', () => {
  const said = tellDay(day([stop(9, 10, 60), stop(11, 13, 140), stop(16, 18, 120)]), {
    0: 'the Trevi Fountain',
    1: 'the Pantheon',
    2: 'the Colosseum',
  })
  assert.match(said, /the Trevi Fountain/)
  assert.match(said, /the Pantheon/)
  assert.match(said, /the Colosseum/)
  // The thing that was wrong with the first version.
  assert.doesNotMatch(said, /photograph/i)
  assert.doesNotMatch(said, /\d+ places stopped at/)
})

test('the longest stop is called out, because that is what a day was about', () => {
  const said = tellDay(day([stop(9, 10, 30), stop(11, 14, 180)]), { 0: 'a café', 1: 'the Vatican Museums' })
  assert.match(said, /longest stop was the Vatican Museums/)
  assert.match(said, /3 hours/)
})

test('one place is one sentence, not a paragraph pretending to be three', () => {
  const said = tellDay(day([stop(10, 12, 120)]), { 0: 'the Uffizi' })
  assert.match(said, /the Uffizi/)
  assert.match(said, /2 hours there/i)
})

test('nothing named says so plainly instead of padding with statistics', () => {
  // The failure mode of the first attempt: when it had nothing to say it
  // reached for counts. A gap in a story is honest; a gap covered with
  // numbers is not.
  const said = tellDay(day([stop(9, 10, 60), stop(12, 13, 60)]), {})
  assert.match(said, /nothing here has a name/)
  // Saying "the photographs put you here" is explaining where the record
  // came from, which is fair. Counting them is the thing that was wrong.
  assert.doesNotMatch(said, /\d+ photographs/i)
  assert.doesNotMatch(said, /\d+ places stopped at/)
})

test('some named and some not is said honestly', () => {
  const said = tellDay(day([stop(9, 10, 60), stop(12, 13, 60), stop(15, 16, 60)]), { 0: 'the Pantheon' })
  assert.match(said, /the Pantheon/)
  assert.match(said, /2 other stops along the way, nowhere named/)
})

test('a day with no stops says nothing at all', () => {
  assert.equal(tellDay({ stops: [] }), '')
  assert.equal(tellDay(null), '')
})

test('the title is where you were, not which number the day is', () => {
  assert.equal(
    titleDay(day([stop(9, 10, 30), stop(11, 14, 180)]), { 0: 'a café', 1: 'the Vatican Museums' }),
    'a café and the Vatican Museums'
  )
  assert.equal(titleDay(day([stop(10, 12, 120)]), { 0: 'the Uffizi' }), 'the Uffizi')
})

test('and falls back to the day number when nowhere is known', () => {
  assert.equal(titleDay(day([stop(9, 10, 60)]), {}), 'Day 2')
})

test('a title never lists six places like a receipt', () => {
  const stops = [stop(9, 10, 20), stop(10, 11, 30), stop(11, 12, 90), stop(13, 14, 40), stop(15, 16, 200)]
  const names = { 0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E' }
  const title = titleDay(day(stops), names)
  assert.equal(title.split(' and ').length, 2)
  // In the order they happened, not in order of length.
  assert.equal(title, 'C and E')
})
