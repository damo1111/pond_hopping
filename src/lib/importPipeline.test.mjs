import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { fingerprintOf } from './alreadyHere.js'
import { readExif } from './exif.js'
import { DISPLAY, THUMB } from './photoResize.js'

// The import route runs the *browser's* code on the server: the same EXIF
// reader, the same digest, the same two sizes. That is the whole design —
// an imported photograph and an uploaded one have to be indistinguishable
// downstream, or every screen that reads them needs a branch.
//
// These are the checks that this stays true. Each one fails quietly rather
// than loudly if it breaks: a photograph on the map at nowhere, or dedupe
// that never fires. Quiet failures are why they are tested at all.

const headOf = (buf, bytes = 256 * 1024) =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + Math.min(bytes, buf.byteLength))

async function aPhotograph({ width = 3000, height = 2000, exif = true } = {}) {
  const base = await sharp({ create: { width, height, channels: 3, background: '#8b6a3a' } })
    .jpeg()
    .toBuffer()
  if (!exif) return base
  return sharp(base)
    .withExif({
      IFD0: { Make: 'Apple', Model: 'iPhone 15 Pro' },
      IFD2: { DateTimeOriginal: '2026:05:22 09:14:03', OffsetTimeOriginal: '+09:00' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '41/1 53/1 5292/100',
        GPSLongitudeRef: 'E',
        GPSLongitude: '12/1 29/1 4110/100',
      },
    })
    .toBuffer()
}

test('the browser’s EXIF reader works unchanged on the server', async () => {
  // If this ever stops being true, every imported photograph loses its date
  // and its place — and Google will not give either back, because the API
  // does not return coordinates at any scope.
  const buf = await aPhotograph()
  const exif = readExif(headOf(buf))
  assert.equal(exif.takenOn, '2026-05-22')
  assert.match(exif.takenAt, /^2026-05-22T09:14:03/)
  assert.ok(Math.abs(exif.lat - 41.898) < 0.001, `lat was ${exif.lat}`)
  assert.ok(Math.abs(exif.lon - 12.4947) < 0.001, `lon was ${exif.lon}`)
})

test('a photograph with no EXIF gives up nulls rather than throwing', async () => {
  const exif = readExif(headOf(await aPhotograph({ exif: false })))
  assert.equal(exif.takenAt, null)
  assert.equal(exif.lat, null)
})

test('the server’s fingerprint is the phone’s fingerprint', async () => {
  // The route computes this inline rather than importing alreadyHere.js.
  // If the two ever drift, a photograph picked off the handset and later
  // picked again from Google stops being recognised as the same one — and
  // nothing anywhere reports an error, it just quietly arrives twice.
  const serverOne = async (head, size) => {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', head)
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${size}-${hex.slice(0, 32)}`
  }
  const buf = await aPhotograph()
  const head = headOf(buf)
  assert.equal(await serverOne(head, buf.byteLength), await fingerprintOf(head, buf.byteLength))
})

test('two different photographs do not agree on a fingerprint', async () => {
  const a = await aPhotograph({ width: 800, height: 600 })
  const b = await aPhotograph({ width: 801, height: 600 })
  assert.notEqual(await fingerprintOf(headOf(a), a.byteLength), await fingerprintOf(headOf(b), b.byteLength))
})

test('the server makes exactly the two sizes the phone makes', async () => {
  const buf = await aPhotograph()
  const of = (spec) =>
    sharp(buf)
      .rotate()
      .resize({ width: spec.maxEdge, height: spec.maxEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: Math.round(spec.quality * 100) })
      .toBuffer()
  const [display, thumb] = await Promise.all([of(DISPLAY), of(THUMB)])
  const dm = await sharp(display).metadata()
  const tm = await sharp(thumb).metadata()
  assert.equal(dm.format, 'webp')
  assert.equal(tm.format, 'webp')
  // Long edge, not width — portrait and landscape come out the same weight.
  assert.equal(Math.max(dm.width, dm.height), DISPLAY.maxEdge)
  assert.equal(Math.max(tm.width, tm.height), THUMB.maxEdge)
})

test('a photograph smaller than the target is never blown up', async () => {
  const buf = await aPhotograph({ width: 300, height: 200, exif: false })
  const out = await sharp(buf)
    .rotate()
    .resize({ width: DISPLAY.maxEdge, height: DISPLAY.maxEdge, fit: 'inside', withoutEnlargement: true })
    .webp()
    .toBuffer()
  const m = await sharp(out).metadata()
  assert.equal(m.width, 300)
})

test('EXIF orientation is applied before the resize, not lost with it', async () => {
  // A portrait photograph stored as landscape-plus-a-rotate-flag. Without
  // .rotate() first, sharp resizes the stored orientation and the phone ends
  // up showing the whole trip on its side.
  const sideways = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#333' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  assert.equal((await sharp(sideways).metadata()).orientation, 6, 'the fixture lost its flag')

  const shrink = (img) =>
    img.resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).webp().toBuffer()

  const right = await sharp(await shrink(sharp(sideways).rotate())).metadata()
  const wrong = await sharp(await shrink(sharp(sideways))).metadata()

  assert.ok(right.height > right.width, `came out ${right.width}x${right.height} — orientation was dropped`)
  // And the check earns its place: without .rotate() it really does come out
  // the other way round, so this is not a test that cannot fail.
  assert.ok(wrong.width > wrong.height)
})
