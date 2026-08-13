import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  asImport,
  closeSession,
  isPhoto,
  listPicked,
  openSession,
  originalUrl,
  pollDelay,
  worthImporting,
} from './googlePhotos.js'

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const bad = (status, text = '') => ({ ok: false, status, text: async () => text })

test('a session cannot be opened without a connection', async () => {
  await assert.rejects(() => openSession(null), /not connected/)
})

test('a refusal from Google is reported, not swallowed', async () => {
  await assert.rejects(
    () => openSession('t', { fetchImpl: async () => bad(403, 'insufficient scope') }),
    /session failed: 403.*insufficient scope/
  )
})

test('the poll interval is Google’s, in their protobuf duration format', () => {
  assert.equal(pollDelay({ pollInterval: '2.5s' }), 2500)
  assert.equal(pollDelay({ pollInterval: '5s' }), 5000)
})

test('but never faster than a second nor slower than ten', () => {
  // Polling faster than asked is how an integration gets rate-limited;
  // slower than ten seconds is somebody watching a spinner for no reason.
  assert.equal(pollDelay({ pollInterval: '0.05s' }), 1000)
  assert.equal(pollDelay({ pollInterval: '600s' }), 10000)
})

test('a missing or nonsense interval falls back rather than throwing', () => {
  assert.equal(pollDelay(undefined), 1000)
  assert.equal(pollDelay({}), 1000)
  assert.equal(pollDelay({ pollInterval: 'soon' }), 1000)
  assert.equal(pollDelay({ pollInterval: '-4s' }), 1000)
})

test('every page is followed to the end', async () => {
  const pages = [
    { mediaItems: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'p2' },
    { mediaItems: [{ id: 'c' }], nextPageToken: 'p3' },
    { mediaItems: [{ id: 'd' }] },
  ]
  let call = 0
  const seen = []
  const items = await listPicked('t', 'sess', {
    fetchImpl: async (url) => {
      seen.push(new URL(url).searchParams.get('pageToken'))
      return ok(pages[call++])
    },
  })
  assert.deepEqual(items.map((i) => i.id), ['a', 'b', 'c', 'd'])
  // First call carries no token; each later one carries the previous answer.
  assert.deepEqual(seen, [null, 'p2', 'p3'])
})

test('an empty pick is not an error', async () => {
  const items = await listPicked('t', 'sess', { fetchImpl: async () => ok({}) })
  assert.deepEqual(items, [])
})

test('tidying up afterwards can fail without failing the import', async () => {
  const done = await closeSession('t', 'sess', {
    fetchImpl: async () => {
      throw new Error('network went away')
    },
  })
  assert.equal(done, false)
})

test('the original is asked for, not a render', () => {
  // Without =d Google hands back a stripped copy, and the EXIF is the whole
  // reason the server fetches it rather than the phone.
  assert.equal(originalUrl('https://lh3.googleusercontent.com/x'), 'https://lh3.googleusercontent.com/x=d')
  assert.equal(originalUrl(null), null)
})

test('a picked photograph maps onto the columns we store', () => {
  const got = asImport({
    id: 'g123',
    createTime: '2026-05-22T09:14:03Z',
    type: 'PHOTO',
    productUrl: 'https://photos.google.com/lr/photo/g123',
    mediaFile: {
      baseUrl: 'https://lh3.googleusercontent.com/x',
      mimeType: 'image/jpeg',
      filename: 'IMG_1234.JPG',
      mediaFileMetadata: { width: 4032, height: 3024 },
    },
  })
  assert.equal(got.googleId, 'g123')
  assert.equal(got.fetchFrom, 'https://lh3.googleusercontent.com/x')
  assert.equal(got.productUrl, 'https://photos.google.com/lr/photo/g123')
  assert.equal(got.takenAtHint, '2026-05-22T09:14:03Z')
  assert.equal(got.width, 4032)
})

test('a renamed or missing field carries a null through rather than throwing', () => {
  // This is somebody else's response shape and it has been renamed once
  // already. Dropping a thousand photographs because a field moved is a far
  // worse failure than carrying a null.
  const got = asImport({ id: 'g1', baseUrl: 'https://lh3/x', mediaMetadata: { creationTime: '2026-01-01T00:00:00Z' } })
  assert.equal(got.fetchFrom, 'https://lh3/x')
  assert.equal(got.takenAtHint, '2026-01-01T00:00:00Z')
  assert.equal(got.productUrl, null)
  assert.equal(got.width, null)
  assert.doesNotThrow(() => asImport({}))
  assert.doesNotThrow(() => asImport())
})

test('video is left behind for now, and photos default to being photos', () => {
  assert.equal(isPhoto({ type: 'VIDEO' }), false)
  assert.equal(isPhoto({ type: 'PHOTO' }), true)
  assert.equal(isPhoto({}), true)
})

test('only items the server can actually fetch are sent to it', () => {
  const picked = [
    { id: 'a', type: 'PHOTO', mediaFile: { baseUrl: 'https://lh3/a' } },
    { id: 'b', type: 'VIDEO', mediaFile: { baseUrl: 'https://lh3/b' } },
    { id: 'c', type: 'PHOTO' }, // no baseUrl — nothing to fetch
    { type: 'PHOTO', mediaFile: { baseUrl: 'https://lh3/d' } }, // no id
  ]
  assert.deepEqual(worthImporting(picked).map((i) => i.googleId), ['a'])
})
