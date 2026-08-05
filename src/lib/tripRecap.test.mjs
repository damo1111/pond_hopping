import test from 'node:test'
import assert from 'node:assert/strict'
import { recapStats, worthRecapping } from './tripRecap.js'

const figure = (stats, key) => stats.figures.find((f) => f.key === key)

test('days away counts both ends', () => {
  const s = recapStats({ trip: { start_date: '2025-06-01', end_date: '2025-06-03' } })
  assert.equal(s.days, 3)
  assert.equal(figure(s, 'days').value, '3')
})

test('a same-day trip is one day, not zero', () => {
  const s = recapStats({ trip: { start_date: '2025-06-01', end_date: '2025-06-01' } })
  assert.equal(s.days, 1)
  assert.equal(figure(s, 'days').label, 'day away')
})

test('a trip with no dates simply has no day figure', () => {
  const s = recapStats({ trip: {} })
  assert.equal(s.days, null)
  assert.equal(figure(s, 'days'), undefined)
})

test('distance sums and reads with a thousands separator', () => {
  const s = recapStats({ flights: [{ distance_km: 7412.4 }, { distance_km: 2891.6 }] })
  assert.equal(s.km, 10304)
  assert.equal(figure(s, 'km').value, '10,304')
})

test('cities merge across journal entries and flights, case-insensitively', () => {
  const s = recapStats({
    entries: [{ city: 'Seoul' }, { city: 'seoul' }],
    flights: [{ arr_city: 'SEOUL', dep_city: 'Hong Kong' }],
  })
  assert.deepEqual(s.cities, ['Seoul', 'Hong Kong'])
  assert.equal(figure(s, 'cities').value, '2')
})

test('blank and missing city names are not counted', () => {
  const s = recapStats({ entries: [{ city: '' }, { city: null }, { city: '  ' }] })
  assert.deepEqual(s.cities, [])
})

test('airports are counted once each across both ends of every leg', () => {
  const s = recapStats({
    flights: [
      { dep_airport: 'MEL', arr_airport: 'SYD' },
      { dep_airport: 'SYD', arr_airport: 'WLG' },
    ],
  })
  assert.equal(figure(s, 'airports').value, '3')
})

test('nothing behind a figure means no figure, not a proud zero', () => {
  const s = recapStats({ trip: {}, flights: [], entries: [], runs: [], photos: [] })
  assert.deepEqual(s.figures, [])
})

test('a sub-kilometre total is not rendered as "0 km"', () => {
  const s = recapStats({ runs: [{ distance_km: 0.4 }] })
  assert.equal(figure(s, 'runs'), undefined)
})

test('singular and plural labels both read correctly', () => {
  const one = recapStats({ flights: [{ distance_km: 900 }], entries: [{ city: 'Perth' }] })
  assert.equal(figure(one, 'flights').label, 'flight')
  assert.equal(figure(one, 'cities').label, 'city')
  assert.equal(figure(one, 'entries').label, 'day written up')
})

test('a trip too thin to fill a page is not offered a recap', () => {
  assert.equal(worthRecapping(recapStats({ trip: { start_date: '2025-06-01', end_date: '2025-06-02' } })), false)
  assert.equal(
    worthRecapping(
      recapStats({
        trip: { start_date: '2025-06-01', end_date: '2025-06-09' },
        flights: [{ distance_km: 8000, dep_airport: 'MEL', arr_airport: 'HKG', arr_city: 'Hong Kong' }],
      })
    ),
    true
  )
})

test('figures counting something you can open know where to send you', () => {
  const s = recapStats({
    trip: { start_date: '2025-06-01', end_date: '2025-06-09' },
    flights: [{ distance_km: 900, dep_airport: 'MEL', arr_airport: 'SYD', arr_city: 'Sydney' }],
    entries: [{ city: 'Sydney' }],
    runs: [{ distance_km: 10 }],
    photos: [{ url: 'x' }],
  })
  const to = Object.fromEntries(s.figures.map((f) => [f.key, f.to]))
  assert.equal(to.entries, 'journal')
  assert.equal(to.photos, 'photos')
  assert.equal(to.flights, 'flights')
  // Runs used to point at the map and got the whole Map tab — hotel and
  // photo filters, flight lines, the runs lost among it. They have their own
  // sheet now. Cities legitimately want a map.
  assert.equal(to.runs, 'runs')
  assert.equal(to.cities, 'map')
})

test('figures with nowhere honest to point stay plain', () => {
  const s = recapStats({
    trip: { start_date: '2025-06-01', end_date: '2025-06-09' },
    flights: [{ distance_km: 900, dep_airport: 'MEL', arr_airport: 'SYD' }],
  })
  const to = Object.fromEntries(s.figures.map((f) => [f.key, f.to]))
  assert.equal(to.days, undefined)
  assert.equal(to.km, undefined)
  assert.equal(to.airports, undefined)
})
