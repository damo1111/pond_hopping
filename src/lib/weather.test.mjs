import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asDegrees, askArchive, deviceScale, placesByDay, sky, stillToAsk, tripAverage, tripSky } from './weather.js'

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

// ── Asking the archive ────────────────────────────────────────────────────

test('one place per day, from the first located photograph of it', () => {
  const photos = [
    { taken_on: '2024-01-22', taken_at: '2024-01-22T18:00:00Z', lat: 41.8988, lon: 12.4971 },
    { taken_on: '2024-01-22', taken_at: '2024-01-22T19:00:00Z', lat: 41.9, lon: 12.5 },
    { taken_on: '2024-01-23', taken_at: '2024-01-23T08:00:00Z', lat: null, lon: null },
    { taken_on: '2024-01-23', taken_at: '2024-01-23T09:00:00Z', lat: 41.93, lon: 12.46 },
  ]
  assert.deepEqual(placesByDay(photos), [
    { on_date: '2024-01-22', lat: 41.9, lon: 12.5 },
    { on_date: '2024-01-23', lat: 41.9, lon: 12.5 },
  ])
})

test('a day nobody photographed anywhere is not asked about', () => {
  assert.deepEqual(placesByDay([{ taken_on: '2024-01-22', lat: null, lon: null }]), [])
  assert.deepEqual(placesByDay([]), [])
})

test('only the gaps are asked for — a past date does not change', () => {
  const wanted = [{ on_date: '2024-01-22' }, { on_date: '2024-01-23' }]
  const done = (d) => ({ on_date: d, wind_kmh: 14, rain_mm: 0 })
  assert.deepEqual(stillToAsk(wanted, [done('2024-01-22')]), [{ on_date: '2024-01-23' }])
  assert.deepEqual(stillToAsk(wanted, wanted.map((w) => done(w.on_date))), [])
})

test('but a row cached before wind was asked for is only half an answer', () => {
  // The weather on a past date still does not change; what we record of it
  // has. Those days go back on the list once, and then never again.
  const wanted = [{ on_date: '2024-01-22' }, { on_date: '2024-01-23' }]
  const old = [{ on_date: '2024-01-22', high_c: 11.2, code: 0 }] // no wind_kmh
  assert.deepEqual(stillToAsk(wanted, old), wanted)
  // A genuinely still day reads 0, not null, and must not be asked twice.
  assert.deepEqual(
    stillToAsk(wanted, [{ on_date: '2024-01-22', wind_kmh: 0, rain_mm: 0 }]),
    [{ on_date: '2024-01-23' }]
  )
})

test('a run of days at one place is one request, not four', async () => {
  const asked = []
  const fetcher = async (url) => {
    asked.push(url)
    return {
      ok: true,
      json: async () => ({
        daily: {
          time: ['2024-01-22', '2024-01-23', '2024-01-24'],
          temperature_2m_max: [11.2, 13.4, 12.0],
          temperature_2m_min: [4.1, 5.0, 4.4],
          weather_code: [0, 3, 61],
          wind_speed_10m_max: [12.6, 31.0, 118.8],
          precipitation_sum: [0, 1.2, 64.0],
        },
      }),
    }
  }
  const rows = await askArchive(
    [
      { on_date: '2024-01-22', lat: 41.9, lon: 12.5 },
      { on_date: '2024-01-23', lat: 41.9, lon: 12.5 },
      { on_date: '2024-01-24', lat: 41.9, lon: 12.5 },
    ],
    fetcher
  )
  assert.equal(asked.length, 1)
  assert.match(asked[0], /start_date=2024-01-22&end_date=2024-01-24/)
  // Wind and rain are what turn a symbol into a sentence — see
  // weatherStory.js. They were always in the response and never asked for.
  assert.match(asked[0], /wind_speed_10m_max/)
  assert.match(asked[0], /precipitation_sum/)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], {
    on_date: '2024-01-22', lat: 41.9, lon: 12.5,
    high_c: 11.2, low_c: 4.1, code: 0, wind_kmh: 12.6, rain_mm: 0,
  })
  assert.equal(rows[2].wind_kmh, 118.8)
})

test('two cities are two requests', async () => {
  let n = 0
  const fetcher = async () => {
    n++
    return { ok: true, json: async () => ({ daily: { time: [], temperature_2m_max: [] } }) }
  }
  await askArchive(
    [
      { on_date: '2024-01-22', lat: 41.9, lon: 12.5 },
      { on_date: '2024-01-23', lat: 55.9, lon: -3.2 },
    ],
    fetcher
  )
  assert.equal(n, 2)
})

test('an archive that is down loses a symbol, not a screen', async () => {
  const dead = async () => { throw new Error('offline') }
  assert.deepEqual(await askArchive([{ on_date: '2024-01-22', lat: 41.9, lon: 12.5 }], dead), [])
  const refused = async () => ({ ok: false })
  assert.deepEqual(await askArchive([{ on_date: '2024-01-22', lat: 41.9, lon: 12.5 }], refused), [])
  assert.deepEqual(await askArchive([], dead), [])
})

test('a day the archive has nothing for is not stored as nothing', async () => {
  // Stored as nulls it would never be asked about again. Left out, it can
  // be filled in when the archive catches up.
  const fetcher = async () => ({
    ok: true,
    json: async () => ({
      daily: { time: ['2024-01-22'], temperature_2m_max: [null], temperature_2m_min: [null], weather_code: [null] },
    }),
  })
  assert.deepEqual(await askArchive([{ on_date: '2024-01-22', lat: 41.9, lon: 12.5 }], fetcher), [])
})
