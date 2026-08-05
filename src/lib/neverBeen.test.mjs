import test from 'node:test'
import assert from 'node:assert/strict'
import { neverBeen, regionsVisited } from './neverBeen.js'

const leg = (alat, alon) => ({ dep_lat: -37.7, dep_lon: 144.8, arr_lat: alat, arr_lon: alon })

test('it recognises where you have actually landed', () => {
  const seen = regionsVisited([
    leg(22.3, 113.9),   // Hong Kong
    leg(37.5, 126.4),   // Seoul
    leg(51.5, -0.5),    // London
  ])
  assert.ok(seen.has('east-asia'))
  assert.ok(seen.has('europe'))
  assert.ok(!seen.has('south-america'))
})

test('departures count too — you were standing there', () => {
  const seen = regionsVisited([{ dep_lat: 51.5, dep_lon: -0.5, arr_lat: 48.9, arr_lon: 2.4 }])
  assert.ok(seen.has('europe'))
})

test('it names somewhere you have not been', () => {
  const s = neverBeen([leg(22.3, 113.9), leg(51.5, -0.5)])
  assert.ok(s)
  assert.ok(!['east-asia', 'europe'].includes(s.id), `suggested a region already visited: ${s.id}`)
  assert.ok(s.prompt.length > 0)
})

test('the same history always suggests the same place', () => {
  const flights = [leg(22.3, 113.9), leg(37.5, 126.4)]
  const a = neverBeen(flights)
  for (let i = 0; i < 5; i++) assert.equal(neverBeen(flights).id, a.id)
})

test('someone who has been everywhere is told nothing rather than a lie', () => {
  const everywhere = [
    [-23, -46], [-1, 36], [41, 69], [40, -74], [51, -0.5], [19, 77],
    [35, 139], [13, 100], [-17, 178], [25, 55],
  ].map(([lat, lon]) => leg(lat, lon))
  assert.equal(neverBeen(everywhere), null)
})

test('the Pacific is found whichever side of the date line it was written', () => {
  assert.ok(regionsVisited([leg(-13.8, -171.8)]).has('oceania'))
  assert.ok(regionsVisited([leg(-13.8, 188.2)]).has('oceania'))
})

test('rows with missing coordinates are skipped, not counted as (0,0)', () => {
  const seen = regionsVisited([
    { arr_lat: null, arr_lon: null, dep_lat: undefined, dep_lon: undefined },
    { arr_lat: 'x', arr_lon: 'y' },
  ])
  assert.equal(seen.size, 0)
})

test('no history at all still produces a suggestion', () => {
  const s = neverBeen([])
  assert.ok(s && s.name)
  assert.equal(s.visited, 0)
})
