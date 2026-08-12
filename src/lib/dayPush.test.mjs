import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REMEMBER, anglesFor, linesAcross, pushLine } from './dayPush.js'

// A fortnight of plausibly similar days — which is the hard case, and the
// one the fourteen-day trip is made of. Same city, same rhythm, mostly
// buildings, one flight at each end.
const day = (i, over = {}) => ({
  date: `2024-01-${String(10 + i).padStart(2, '0')}`,
  from: '08:1' + (i % 10),
  to: '19:2' + (i % 10),
  photographs: 40 + i,
  km_on_foot: 5 + (i % 3),
  ranked: [
    { subject: 'architecture', n: 30 + i, word: 'buildings' },
    { subject: 'street', n: 8, word: 'street scenes' },
    { subject: 'food', n: 3, word: 'plates of food' },
    { subject: 'artwork', n: 1, word: 'piece of art' },
  ],
  legs: [],
  activities: [],
  first_time: [],
  ...over,
})

test('a fortnight of similar days never repeats itself two nights running', () => {
  const fortnight = Array.from({ length: 14 }, (_, i) => day(i))
  const lines = linesAcross(fortnight)
  assert.equal(lines.filter(Boolean).length, 14)
  for (let i = 1; i < lines.length; i++) {
    assert.notEqual(lines[i].shape, lines[i - 1].shape, `night ${i} repeated ${lines[i].shape}`)
    assert.notEqual(lines[i].text, lines[i - 1].text)
  }
  // And it genuinely rotates rather than alternating between two.
  assert.ok(new Set(lines.map((l) => l.shape)).size >= 4, [...new Set(lines.map((l) => l.shape))].join(','))
})

test('nothing is repeated inside the window it is asked to remember', () => {
  const fortnight = Array.from({ length: 14 }, (_, i) => day(i))
  const lines = linesAcross(fortnight)
  for (let i = 0; i < lines.length; i++) {
    const window = lines.slice(Math.max(0, i - REMEMBER), i).map((l) => l.shape)
    // Only enforced while there are still unused angles to reach for; a
    // long trip of identical days must still say something.
    if (window.length < 4) continue
    const used = new Set(window)
    if (used.size < anglesFor(fortnight[i]).length) {
      assert.ok(!window.slice(-2).includes(lines[i].shape), `night ${i}`)
    }
  }
})

test('the rarest true thing leads', () => {
  const arrival = day(0, { first_time: ['Rome'], legs: [{ from: 'LHR', to: 'FCO' }] })
  assert.equal(pushLine(arrival, {}).shape, 'first_time')
  // With nowhere new, the flight leads instead.
  const moving = day(0, { legs: [{ from: 'LHR', to: 'FCO' }] })
  assert.equal(pushLine(moving, {}).shape, 'flew')
})

test('the joke is the arithmetic, and it only fires when it is actually funny', () => {
  const lopsided = anglesFor(day(0)).find((a) => a.shape === 'lopsided')
  assert.ok(lopsided, 'thirty buildings against one piece of art is lopsided')
  assert.match(lopsided.text, /buildings\. And 1 piece of art\./)

  // Evened out, the joke is not made.
  const even = day(0, {
    ranked: [
      { subject: 'architecture', n: 9, word: 'buildings' },
      { subject: 'food', n: 7, word: 'plates of food' },
    ],
  })
  assert.equal(anglesFor(even).some((a) => a.shape === 'lopsided'), false)
})

test('a day with nothing in it gets no notification at all', () => {
  const nothing = { from: null, to: null, photographs: 0, km_on_foot: 0, ranked: [], legs: [], activities: [], first_time: [] }
  assert.equal(pushLine(nothing, {}), null)
  assert.deepEqual(linesAcross([nothing]), [null])
})

test('same day in, same line out — varied is not the same as random', () => {
  const d = day(3, { first_time: ['Kyoto'] })
  assert.deepEqual(pushLine(d, { recent: ['flew'] }), pushLine(d, { recent: ['flew'] }))
})
