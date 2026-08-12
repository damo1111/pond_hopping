import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clusterPhotos,
  looksOngoing,
  suggestTitle,
  slugify,
  summarise,
  GAP_DAYS,
} from './tripFromPhotos.js'

const at = (iso, lat, lon) => ({ takenAt: `${iso}T09:00:00Z`, lat, lon })

test('a run of consecutive days is one trip', () => {
  const { clusters, undated } = clusterPhotos([
    at('2024-03-12'), at('2024-03-13'), at('2024-03-15'), at('2024-03-19'),
  ])
  assert.equal(clusters.length, 1)
  assert.equal(undated.length, 0)
  assert.equal(clusters[0].start, '2024-03-12')
  assert.equal(clusters[0].end, '2024-03-19')
  assert.equal(clusters[0].count, 4)
})

test('a gap longer than the threshold splits two trips', () => {
  const { clusters } = clusterPhotos([
    at('2024-03-12'), at('2024-03-14'),
    at('2024-06-01'), at('2024-06-03'),
  ])
  assert.equal(clusters.length, 2)
  assert.deepEqual(clusters.map((c) => c.start), ['2024-03-12', '2024-06-01'])
})

// The threshold has to separate a quiet day inside a trip from the space
// between trips, so both sides of it are worth pinning down.
test('a gap exactly at the threshold stays one trip', () => {
  const { clusters } = clusterPhotos([at('2024-03-01'), at(`2024-03-0${1 + GAP_DAYS}`)])
  assert.equal(clusters.length, 1)
})

test('a gap one day past the threshold splits', () => {
  const { clusters } = clusterPhotos([at('2024-03-01'), at(`2024-03-0${2 + GAP_DAYS}`)])
  assert.equal(clusters.length, 2)
})

// The sheet now says "Chuck in everything. I'll sort it into trips." — which
// is a promise about a whole camera roll, not about two holidays. Pinned
// here so the sentence cannot outlive the behaviour: a year of travel, tipped
// in at once, comes back as separate trips with their own dates.
test('a whole camera roll comes back as one trip per holiday', () => {
  const { clusters } = clusterPhotos([
    at('2024-02-09', 41.9, 12.5), at('2024-02-10', 41.9, 12.5), at('2024-02-12', 41.9, 12.5),
    at('2024-05-30', 35.7, 139.7), at('2024-06-01', 35.0, 135.8), at('2024-06-03', 34.7, 135.5),
    at('2024-09-14', -36.8, 174.8), at('2024-09-15', -41.3, 174.8),
    at('2024-12-27', 40.4, -3.7),
  ])
  assert.equal(clusters.length, 4)
  assert.deepEqual(
    clusters.map((c) => [c.start, c.end]),
    [
      ['2024-02-09', '2024-02-12'],
      ['2024-05-30', '2024-06-03'],
      ['2024-09-14', '2024-09-15'],
      ['2024-12-27', '2024-12-27'],
    ],
  )
})

test('photos arrive in any order and still cluster by time', () => {
  // Sorted these are 12th, 15th, 19th — gaps of 3 and 4 days, both within
  // the threshold, so it is one trip however they arrive.
  const { clusters } = clusterPhotos([at('2024-03-19'), at('2024-03-12'), at('2024-03-15')])
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].start, '2024-03-12')
  assert.equal(clusters[0].end, '2024-03-19')
})

// WhatsApp, Slack and Google Photos all routinely strip EXIF. Undated photos
// are the normal case, not an error case — they must survive to the caller
// rather than being dropped or given an invented date.
test('undated photos are kept separately, never guessed at', () => {
  const { clusters, undated } = clusterPhotos([
    at('2024-03-12'), { takenAt: null }, { }, { takenAt: 'not a date' },
  ])
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].count, 1)
  assert.equal(undated.length, 3)
})

test('every photo stripped of EXIF yields no clusters and no crash', () => {
  const { clusters, undated } = clusterPhotos([{}, {}, {}])
  assert.equal(clusters.length, 0)
  assert.equal(undated.length, 3)
  assert.match(summarise(null, 3), /none with a date/)
})

test('nothing at all is handled', () => {
  assert.deepEqual(clusterPhotos([]), { clusters: [], undated: [] })
  assert.deepEqual(clusterPhotos(undefined), { clusters: [], undated: [] })
  assert.equal(summarise(null, 0), 'No photos yet.')
})

test('bounds and centre come only from photos that have coordinates', () => {
  const { clusters } = clusterPhotos([
    at('2024-03-12', 38.7, -9.1),
    at('2024-03-13', 41.1, -8.6),
    at('2024-03-14'), // no GPS
  ])
  const c = clusters[0]
  assert.equal(c.count, 3)
  assert.equal(c.located, 2)
  assert.equal(c.bounds.minLat, 38.7)
  assert.equal(c.bounds.maxLat, 41.1)
  assert.ok(Math.abs(c.centre.lat - 39.9) < 0.001)
})

test('no coordinates anywhere leaves bounds null rather than zero', () => {
  const { clusters } = clusterPhotos([at('2024-03-12'), at('2024-03-13')])
  assert.equal(clusters[0].bounds, null)
  assert.equal(clusters[0].centre, null)
  assert.equal(clusters[0].located, 0)
})

test('a trip whose last photo is today reads as still going', () => {
  const now = Date.parse('2024-03-20T12:00:00Z')
  const { clusters } = clusterPhotos([at('2024-03-18'), at('2024-03-20')])
  assert.equal(looksOngoing(clusters[0], now), true)
})

test('a trip that ended last year does not', () => {
  const now = Date.parse('2026-08-06T12:00:00Z')
  const { clusters } = clusterPhotos([at('2024-03-18'), at('2024-03-20')])
  assert.equal(looksOngoing(clusters[0], now), false)
})

test('the suggested title is a month and a year, and obviously editable', () => {
  const { clusters } = clusterPhotos([at('2024-03-12')])
  assert.equal(suggestTitle(clusters[0]), 'March 2024')
  assert.equal(suggestTitle(null), 'A trip')
})

test('slugs are url-safe, bounded, and carry the date', () => {
  assert.equal(slugify('Lisbon & Porto!', '2024-03-12'), 'lisbon-porto-240312')
  assert.equal(slugify('', ''), 'trip')
  assert.ok(slugify('x'.repeat(120), '2024-03-12').length <= 48)
  assert.doesNotMatch(slugify('Ã‰migré — trip', '2024-01-01'), /[^a-z0-9-]/)
})

test('the summary says what was found, including when nothing was located', () => {
  const { clusters } = clusterPhotos([at('2024-03-12', 38.7, -9.1), at('2024-03-14')])
  const s = summarise(clusters[0])
  assert.match(s, /2 photos/)
  assert.match(s, /12 Mar 2024 – 14 Mar 2024/)
  assert.match(s, /1 with a location/)

  const { clusters: c2 } = clusterPhotos([at('2024-05-01')])
  assert.match(summarise(c2[0]), /1 photo · 1 May 2024 · none with a location/)
})

test('a single-day trip reads as one date, not a range', () => {
  const { clusters } = clusterPhotos([at('2024-03-12'), at('2024-03-12')])
  assert.equal(clusters[0].start, clusters[0].end)
  assert.doesNotMatch(summarise(clusters[0]), /–/)
})
