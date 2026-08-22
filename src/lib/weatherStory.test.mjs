import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  average, severity, stormWord, theDay, weatherLine, worthSaying,
} from './weatherStory.js'

const day = (on_date, o = {}) => ({ on_date, high_c: 20, low_c: 14, code: 1, wind_kmh: 12, rain_mm: 0, ...o })
const MILD = [day('2026-06-01'), day('2026-06-02'), day('2026-06-03')]

test('a mild trip produces no sentences at all', () => {
  // The whole point. A story that mentions the weather every day is a
  // weather report, and nobody reads their own holiday as a weather report.
  for (const d of MILD) {
    assert.equal(severity(d, MILD), 0, d.on_date)
    assert.equal(weatherLine(d, MILD), null)
  }
  assert.equal(theDay(MILD), null)
})

test('the typhoon is named, and named correctly for where it was', () => {
  // David's last day in Japan. The WMO code cannot tell this from a rumble
  // of thunder; the wind can.
  const japan = day('2026-06-10', { lat: 35.7, lon: 139.7, code: 95, wind_kmh: 130, rain_mm: 90 })
  const trip = [...MILD, japan]
  assert.equal(severity(japan, trip), 3)
  assert.match(weatherLine(japan, trip), /edge of a typhoon/)
  assert.match(weatherLine(japan, trip), /130 km\/h/)
})

test('the same wind gets the right word in each ocean', () => {
  assert.equal(stormWord(35.7, 139.7), 'typhoon')   // Tokyo
  assert.equal(stormWord(14.6, 121.0), 'typhoon')   // Manila
  assert.equal(stormWord(25.8, -80.2), 'hurricane') // Miami
  assert.equal(stormWord(-16.9, 145.8), 'cyclone')  // Cairns
  assert.equal(stormWord(-20.2, 57.5), 'cyclone')   // Mauritius
  // Nowhere in particular, or nothing recorded: no claim about the basin.
  assert.equal(stormWord(null, null), 'storm')
  assert.equal(stormWord('', ''), 'storm')
})

test('the claim is hedged to what one reading can support', () => {
  // The archive gives the wind over one point. The centre may have been a
  // hundred miles away, and "a typhoon hit you" is not a thing this knows.
  const d = day('2026-06-10', { lat: 35.7, lon: 139.7, wind_kmh: 130 })
  const said = weatherLine(d, [...MILD, d])
  assert.ok(!/a typhoon hit/i.test(said))
  assert.match(said, /edge of/)
})

test('a soaking is worth saying and a shower is not', () => {
  const wet = day('2026-06-04', { rain_mm: 30, code: 63 })
  const damp = day('2026-06-04', { rain_mm: 3, code: 61 })
  assert.equal(worthSaying(wet, [...MILD, wet]), true)
  assert.equal(worthSaying(damp, [...MILD, damp]), false)
  assert.match(weatherLine(wet, [...MILD, wet]), /30mm of rain/)
})

test('snow counts even when it is gentle', () => {
  const snow = day('2026-06-04', { code: 73 })
  assert.equal(severity(snow, [...MILD, snow]), 2)
  assert.equal(weatherLine(snow, [...MILD, snow]), 'Snow.')
})

test('a day is measured against its own trip, not against a number', () => {
  // Eighteen degrees is a cold day in Bangkok and a good one in Reykjavik.
  const hot = [day('1', { high_c: 33 }), day('2', { high_c: 34 }), day('3', { high_c: 32 })]
  const cool = { ...day('4', { high_c: 22 }) }
  assert.equal(severity(cool, [...hot, cool]), 1)
  assert.equal(Math.round(average(hot)), 33)

  // The same 22°C in a cold trip is unremarkable.
  const cold = [day('1', { high_c: 20 }), day('2', { high_c: 21 }), day('3', { high_c: 22 })]
  assert.equal(severity({ ...cool }, [...cold, cool]), 0)
})

test('a gale is a clause, not a sentence', () => {
  // Level 1: noted by severity, not loud enough to interrupt the story.
  const windy = day('2026-06-04', { wind_kmh: 70 })
  assert.equal(severity(windy, [...MILD, windy]), 1)
  assert.equal(worthSaying(windy, [...MILD, windy]), false)
  assert.equal(weatherLine(windy, [...MILD, windy]), null)
})

test('one day per trip, and the worst of them', () => {
  const a = day('2026-06-04', { rain_mm: 30 })
  const b = day('2026-06-05', { lat: 35.7, lon: 139.7, wind_kmh: 130 })
  const c = day('2026-06-06', { rain_mm: 28 })
  assert.equal(theDay([...MILD, a, b, c]).on_date, '2026-06-05')
})

test('and the later one when two are equally bad', () => {
  const a = day('2026-06-04', { rain_mm: 30 })
  const b = day('2026-06-06', { rain_mm: 30 })
  assert.equal(theDay([...MILD, a, b]).on_date, '2026-06-06')
})

test('missing readings never become zero readings', () => {
  // Number(null) is 0, and 0 km/h of wind on a still day is a real reading.
  // A row from before wind was asked for is not.
  const blank = { on_date: '2026-06-04', high_c: null, low_c: null, code: null, wind_kmh: null, rain_mm: null }
  assert.equal(severity(blank, [blank]), 0)
  assert.equal(weatherLine(blank, [blank]), null)
  assert.equal(average([blank]), null)
  assert.equal(severity(null), 0)
  assert.equal(theDay([]), null)
  assert.equal(theDay(), null)
})

test('a string from the database is still a number', () => {
  // numeric columns come back as strings through PostgREST often enough.
  const d = day('2026-06-10', { lat: '35.7', lon: '139.7', wind_kmh: '130', rain_mm: '90' })
  assert.equal(severity(d, [...MILD, d]), 3)
  assert.match(weatherLine(d, [...MILD, d]), /typhoon/)
})
