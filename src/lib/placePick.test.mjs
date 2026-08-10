import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLOSE_M, askWith, pickPlace, plan } from './placePick.js'

const c = (name, metres, category = 'shop') => ({ id: name, name, metres, category })
const stop = (minutes = 40, photos = []) => ({ minutes, photos })

test('one thing at the spot is the answer, no photograph needed', () => {
  const { verdict, place } = pickPlace(stop(), [c('Colosseum', 20, 'monument')])
  assert.equal(verdict, 'settled')
  assert.equal(place.name, 'Colosseum')
})

test('nothing mapped there is not a failure, it is an answer', () => {
  // A layby on a mountain road is a real stop with no name, and inventing
  // one would be worse than saying nothing.
  assert.equal(pickPlace(stop(), []).verdict, 'nowhere')
})

test('one thing nearby, nothing else close, is still the answer', () => {
  const { verdict, place } = pickPlace(stop(), [c('Trevi Fountain', 90, 'monument')])
  assert.equal(verdict, 'settled')
  assert.equal(place.name, 'Trevi Fountain')
})

test('but two things equally not-quite-there names neither', () => {
  const { verdict } = pickPlace(stop(), [c('A', 90), c('B', 110)])
  assert.equal(verdict, 'nowhere')
})

test('a dense spot is the case worth a photograph', () => {
  // Borough Market: everything inside the accuracy of the fix. No amount
  // of arithmetic separates these, because the answer is not in the numbers.
  const { verdict, shortlist } = pickPlace(stop(20), [
    c('Bread Ahead', 8, 'bakery'),
    c('Neal’s Yard Dairy', 14, 'cheese shop'),
    c('Kappacasein', 19, 'food stall'),
    c('Monmouth Coffee', 26, 'cafe'),
  ])
  assert.equal(verdict, 'ambiguous')
  assert.ok(shortlist.length >= 2)
})

test('an hour and a half among dry cleaners was the museum', () => {
  // One thing at the spot you could plausibly spend the afternoon in, and
  // a stop that lasted like a visit. That is a real signal, not a guess.
  const { verdict, place } = pickPlace(stop(95), [
    c('Galleria Borghese', 12, 'art museum'),
    c('Quick Dry Cleaners', 18, 'dry cleaner'),
    c('Locksmith', 30, 'hardware'),
  ])
  assert.equal(verdict, 'settled')
  assert.equal(place.name, 'Galleria Borghese')
})

test('the same spot passed through in four minutes is not', () => {
  // Same candidates, but nobody visits a gallery for four minutes. Without
  // the dwell time the signal is not there, so it goes to the photograph.
  const { verdict } = pickPlace(stop(4), [
    c('Galleria Borghese', 12, 'art museum'),
    c('Quick Dry Cleaners', 18, 'dry cleaner'),
  ])
  assert.equal(verdict, 'ambiguous')
})

test('two museums at one address still need a photograph', () => {
  const { verdict, shortlist } = pickPlace(stop(90), [
    c('Museo A', 10, 'museum'),
    c('Galleria B', 15, 'art gallery'),
  ])
  assert.equal(verdict, 'ambiguous')
  assert.equal(shortlist.length, 2)
})

test('the shortlist is the neighbours, so the model chooses rather than invents', () => {
  const { shortlist } = pickPlace(stop(20), [c('A', 5), c('B', 10), c('C', 15)])
  assert.deepEqual(shortlist.map((x) => x.name), ['A', 'B', 'C'])
})

test('and it never runs long enough to be a bill', () => {
  const many = Array.from({ length: 40 }, (_, i) => c(`Stall ${i}`, i + 1))
  assert.ok(pickPlace(stop(20), many).shortlist.length <= 8)
})

test('close means close, and the constant is a real distance', () => {
  assert.ok(CLOSE_M > 0 && CLOSE_M < 200)
  assert.equal(pickPlace(stop(), [c('X', CLOSE_M - 1)]).verdict, 'settled')
})

test('planning a day says which stops cost anything', () => {
  const stops = [stop(60), stop(60), stop(60)]
  const answers = [
    [c('Colosseum', 12, 'monument')],
    [c('Stall A', 6), c('Stall B', 9), c('Stall C', 12)],
    [],
  ]
  const out = plan(stops, (_s, i) => answers[i])
  assert.deepEqual(out.map((x) => x.verdict), ['settled', 'ambiguous', 'nowhere'])
  // One of three stops needs a photograph looked at. That ratio is the
  // whole economics of this: a trip, not a photo library, is what gets read.
  assert.equal(out.filter((x) => x.verdict === 'ambiguous').length, 1)
})

test('what to show is taken from the middle of the stop', () => {
  // The first shot is often the walk up to a place and the last is often
  // leaving it; the middle is the place itself.
  const photos = [1, 2, 3, 4, 5].map((n) => ({ id: n }))
  assert.deepEqual(askWith(stop(60, photos)).map((p) => p.id), [2, 3])
})

test('and a stop with one photograph offers the one it has', () => {
  const photos = [{ id: 1 }]
  assert.deepEqual(askWith(stop(60, photos)), photos)
  assert.deepEqual(askWith(stop(60, [])), [])
})

test('the "only destination" rule needs the closest, not just the only', () => {
  // Caught by the pipeline tests: in a food market every neighbour is
  // somewhere you linger, and leaning on a category word list picked the
  // one it happened to recognise — the cafe, twenty metres away — over the
  // two stalls nearer than it. Requiring the destination to be the nearest
  // too keeps the rule to the case it was written for.
  const { verdict } = pickPlace(stop(40), [
    c('Bread Ahead', 8, 'Bakery'),
    c('Kappacasein', 14, 'Food Stall'),
    c('Monmouth Coffee', 20, 'Cafe'),
  ])
  assert.equal(verdict, 'ambiguous')
})

test('and still settles the museum among the dry cleaners', () => {
  const { verdict, place } = pickPlace(stop(95), [
    c('Galleria Borghese', 12, 'art museum'),
    c('Quick Dry Cleaners', 18, 'dry cleaner'),
  ])
  assert.equal(verdict, 'settled')
  assert.equal(place.name, 'Galleria Borghese')
})

test('a square beats the obelisk standing in it', () => {
  // Rome, 24 January, 18:25–19:59 at 41.8986,12.4732. This came back as
  // "Obelisco Agonalis" — an obelisk — when the honest answer to where
  // somebody spent an hour and a half is Piazza Navona.
  const { verdict, place } = pickPlace(stop(94), [
    c('Obelisco Agonalis', 37, 'Monument'),
    c('Fountain of the Four Rivers', 45, 'Fountain'),
    c('Fontana del Moro', 51, 'Fountain'),
    c('Piazza Navona', 63, 'Plaza'),
  ])
  assert.equal(verdict, 'settled')
  assert.equal(place.name, 'Piazza Navona')
})

test('but a square with somewhere to eat in it still goes to the photograph', () => {
  // Largo di Torre Argentina, half an hour at dinner time. The plaza is
  // there, but so are two pizzerias, and "the plaza" is not where he ate.
  // This is the same shape as Borough Market and must behave the same way.
  const { verdict } = pickPlace(stop(31), [
    c('Area Sacra', 31, 'Monument'),
    c('Largo di Torre Argentina', 39, 'Plaza'),
    c('Alice Pizza', 47, 'Pizzeria'),
    c('Rossopomodoro', 51, 'Pizzeria'),
  ])
  assert.equal(verdict, 'ambiguous')
})

test('a fountain on its own is still the fountain', () => {
  // No square anywhere near it — the rule must not invent a container.
  const { verdict, place } = pickPlace(stop(30), [c('Fontana dell’Acqua Paola', 47, 'Fountain')])
  assert.equal(verdict, 'settled')
  assert.equal(place.name, 'Fontana dell’Acqua Paola')
})
