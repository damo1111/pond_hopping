import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PLACES, ideasFor, seasonalNote } from './planIdeas.js'

// Somebody who has flown Melbourne → Rome. Europe and Oceania have pins in
// them; every other region is untouched.
const FLOWN = [{ dep_lat: -37.7, dep_lon: 144.8, arr_lat: 41.8, arr_lon: 12.2 }]

test('somewhere never been outranks somewhere already flown to', () => {
  // The whole claim of the strip. If Rome outranked Patagonia for somebody who
  // has been to Rome and not to South America, the suggestion would be worth
  // nothing — it would just be a list of famous places.
  const got = ideasFor({ flights: FLOWN, month: 1 })
  const rome = got.findIndex((i) => i.id === 'rome')
  const patagonia = got.findIndex((i) => i.id === 'patagonia')
  assert.ok(patagonia > -1, 'Patagonia should be offered')
  assert.ok(rome === -1 || patagonia < rome, 'a region with no pin in it comes first')
})

test('and being in season separates places of equal freshness', () => {
  // Season is the tiebreaker, not a rival — never-been is the stronger claim
  // and beats being in season on its own. So this compares two places in the
  // same region: Lisbon is a spring city, the fjords are a July one, and this
  // history has been to Europe, so only the month is left to tell them apart.
  //
  // The whole list, not the strip's eight, or a place ranked off the end
  // returns -1 and the comparison passes for the wrong reason.
  const all = { flights: FLOWN, limit: PLACES.length }
  const april = ideasFor({ ...all, month: 4 }).map((i) => i.id)
  const july = ideasFor({ ...all, month: 7 }).map((i) => i.id)
  assert.ok(april.indexOf('lisbon') < april.indexOf('norway'), 'Lisbon leads in April')
  assert.ok(july.indexOf('norway') < july.indexOf('lisbon'), 'the fjords lead in July')
})

test('and never-been beats in-season, because it is the stronger claim', () => {
  // Patagonia in July is out of season and still outranks the fjords, which
  // are in it — because somebody has flown to Europe and never to South
  // America. Getting this the other way round turns the strip into a list of
  // famous places at the right time of year, which is a brochure.
  const got = ideasFor({ flights: FLOWN, month: 7, limit: PLACES.length }).map((i) => i.id)
  assert.ok(got.indexOf('patagonia') < got.indexOf('norway'))
})

test('the reason says which of the two it is', () => {
  const got = ideasFor({ flights: FLOWN, month: 1 })
  const p = got.find((i) => i.id === 'patagonia')
  assert.equal(p.why, 'Never been — and now is the time')
  assert.equal(p.fresh, true)
  assert.equal(p.inSeason, true)
})

test('and never claims somebody has not been somewhere they have', () => {
  // "You've never been" is the strongest thing this app can say, so it must
  // never be said about a region with a pin in it. Rome is in Europe and this
  // history flew there.
  for (const idea of ideasFor({ flights: FLOWN, month: 5 })) {
    if (idea.region === 'europe') {
      assert.equal(idea.fresh, false, `${idea.name} is in a region already visited`)
      assert.ok(!/never/i.test(idea.why), `"${idea.why}" claims otherwise`)
    }
  }
})

test('with no history at all it never claims to know where somebody has been', () => {
  // The signed-out case, and most people looking at this strip. An empty
  // history is not evidence of an empty map — rendered without this rule, the
  // strip told a signed-out David he had been "nowhere near" Rome, which he
  // has been to twice.
  const got = ideasFor({ flights: [], month: 6 })
  assert.ok(got.length > 0, 'there is still plenty to suggest')
  assert.ok(!got.some((i) => i.fresh), 'nothing is claimed about where they have been')
  assert.ok(!got.some((i) => /never|nowhere/i.test(i.why)), 'and nothing says so in words')
})

test('but the season still ranks them without any history', () => {
  // Losing the freshness signal must not leave the strip in list order.
  const june = ideasFor({ flights: [], month: 6, limit: PLACES.length }).map((i) => i.id)
  assert.ok(june.indexOf('norway') < june.indexOf('rome'), 'June belongs to the fjords')
})

test('the order is stable, because the strip is on a loop', () => {
  // It drifts past on a repeating animation. An order that changed between
  // renders would be visibly wrong within about four seconds.
  const a = ideasFor({ flights: FLOWN, month: 3 }).map((i) => i.id)
  const b = ideasFor({ flights: FLOWN, month: 3 }).map((i) => i.id)
  assert.deepEqual(a, b)
})

test('the strip is capped', () => {
  assert.equal(ideasFor({ limit: 4 }).length, 4)
  assert.ok(ideasFor({}).length <= 8)
})

test('every place has somewhere real to sit and something to draw', () => {
  const arts = new Set(PLACES.map((p) => p.art))
  for (const p of PLACES) {
    assert.ok(p.name && p.region && p.art, `${p.id} is incomplete`)
    assert.ok(p.months.length, `${p.id} is good in no month of the year`)
    assert.ok(
      p.months.every((m) => m >= 1 && m <= 12),
      `${p.id} has a month outside the calendar`
    )
  }
  assert.ok(arts.size >= 5, 'too few drawings — the strip would repeat itself')
})

test('the seasonal line looks a month ahead, not at today', () => {
  // A suggestion you can still act on is worth more than one about the week
  // you are already in.
  const note = seasonalNote(3)
  assert.ok(note.startsWith('April'), `got "${note}"`)
})

test('and wraps round the end of the year', () => {
  assert.ok(seasonalNote(12).startsWith('January'), 'December should look at January')
})

test('with nothing worth saying it says nothing', () => {
  // Rather than inventing a month. An empty aside is invisible; a wrong one
  // is a lie in gold text at the foot of the screen.
  assert.equal(seasonalNote(5, [{ id: 'x', name: 'X', months: [1], region: 'europe', art: 'peak' }]), null)
})
