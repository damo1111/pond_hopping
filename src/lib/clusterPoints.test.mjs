import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clusterPoints } from './clusterPoints.js'

const at = (lat, lon, id) => ({ lat, lon, id })

test('points far apart stay single', () => {
  const out = clusterPoints([at(41.9, 12.5, 'a'), at(51.5, -0.1, 'b')], 5)
  assert.equal(out.length, 2)
  assert.ok(out.every((c) => c.type === 'single'))
})

test('points on top of each other become one badge', () => {
  const out = clusterPoints([at(41.9, 12.5, 'a'), at(41.901, 12.501, 'b')], 5)
  assert.equal(out.length, 1)
  assert.equal(out[0].type, 'cluster')
  assert.equal(out[0].points.length, 2)
})

test('zooming in splits a cluster back into its points', () => {
  const pts = [at(41.9, 12.5, 'a'), at(41.94, 12.54, 'b')]
  assert.equal(clusterPoints(pts, 5).filter((c) => c.type === 'cluster').length, 1)
  assert.ok(clusterPoints(pts, 14).every((c) => c.type === 'single'))
})

// The one that matters. A trail is drawn on point by point, so a cluster
// gains members frame by frame — and its centroid moves every time. Keyed on
// that, React sees a different cluster each frame and Leaflet rebuilds the
// marker sixty times a second. The cell it sits in does not move.
test('a cluster keeps its key while points are added to it', () => {
  const growing = [at(41.90, 12.50, 'a'), at(41.91, 12.51, 'b'), at(41.92, 12.52, 'c')]
  const keys = []
  const centroids = []
  for (let n = 2; n <= growing.length; n++) {
    const [c] = clusterPoints(growing.slice(0, n), 5).filter((x) => x.type === 'cluster')
    keys.push(c.key)
    centroids.push(`${c.lat},${c.lon}`)
  }
  assert.equal(new Set(keys).size, 1, 'the key held still')
  assert.ok(new Set(centroids).size > 1, 'and the centroid did not, which is the point')
})

test('singles carry a key too, so a cell that grows into a cluster is the same node', () => {
  const [one] = clusterPoints([at(41.9, 12.5, 'a')], 5)
  const [two] = clusterPoints([at(41.9, 12.5, 'a'), at(41.901, 12.501, 'b')], 5)
  assert.equal(one.type, 'single')
  assert.equal(two.type, 'cluster')
  assert.equal(one.key, two.key)
})

test('nothing in, nothing out', () => {
  assert.deepEqual(clusterPoints([], 5), [])
})
