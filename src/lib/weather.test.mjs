import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asDegrees, deviceScale, sky, tripAverage, tripSky } from './weather.js'

test('celsius stays celsius, and turns into fahrenheit when asked', () => {
  assert.deepEqual(asDegrees(11, 'c'), { value: 11, scale: 'c', text: '11°C' })
  assert.deepEqual(asDegrees(11, 'f'), { value: 52, scale: 'f', text: '52°F' })
  assert.deepEqual(asDegrees(0, 'f'), { value: 32, scale: 'f', text: '32°F' })
})

test('whole degrees, because nobody remembers a trip as 11.4', () => {
  assert.equal(asDegrees(11.4, 'c').text, '11°C')
  assert.equal(asDegrees(11.6, 'c').text, '12°C')
})

test('nothing in, nothing out — never "NaN°"', () => {
  assert.equal(asDegrees(null, 'c'), null)
  assert.equal(asDegrees(undefined, 'c'), null)
  assert.equal(asDegrees('warm', 'c'), null)
})

test('the device decides when nobody has', () => {
  assert.equal(deviceScale('en-US'), 'f')
  assert.equal(deviceScale('en-GB'), 'c')
  assert.equal(deviceScale('de-DE'), 'c')
  assert.equal(deviceScale('en-AU'), 'c')
  // No region at all is not a reason to guess Fahrenheit.
  assert.equal(deviceScale('en'), 'c')
  assert.equal(asDegrees(11, 'device', 'en-US').text, '52°F')
  assert.equal(asDegrees(11, 'device', 'en-GB').text, '11°C')
})

test('a code becomes something to look at and something to read', () => {
  assert.deepEqual(sky(0), { symbol: '☀️', said: 'clear' })
  assert.equal(sky(3).said, 'overcast')
  assert.equal(sky(63).said, 'rain')
  assert.equal(sky(95).said, 'thunderstorms')
  assert.deepEqual(sky(null), { symbol: null, said: null })
  assert.deepEqual(sky(120), { symbol: null, said: null })
})

test('a trip averages its afternoons, and survives a day with no reading', () => {
  const days = [{ high_c: 10 }, { high_c: 13 }, { high_c: null }, {}]
  assert.equal(tripAverage(days), 11.5)
  assert.equal(tripAverage([]), null)
  assert.equal(tripAverage([{ high_c: null }]), null)
})

test('a trip takes the sky it had most of', () => {
  assert.equal(tripSky([{ code: 0 }, { code: 0 }, { code: 63 }]), '☀️')
  assert.equal(tripSky([{ code: 63 }, { code: 61 }, { code: 0 }]), '🌧️')
  assert.equal(tripSky([]), null)
})
