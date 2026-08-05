import test from 'node:test'
import assert from 'node:assert/strict'
import { readExif } from './exif.js'

// Builds a real JPEG-with-EXIF byte-for-byte rather than mocking the parser's
// input, so the marker walk, the byte-order switch and the inline-vs-pointer
// rule are all genuinely exercised.
function buildJpeg({ little = true, dateTime, offset, lat, latRef, lon, lonRef, orientation } = {}) {
  const entries0 = []
  const entriesExif = []
  const entriesGps = []
  const heap = [] // values too long to sit inside their entry

  const rational = (parts) => {
    const b = new Uint8Array(parts.length * 8)
    const v = new DataView(b.buffer)
    parts.forEach((p, i) => {
      v.setUint32(i * 8, Math.round(p * 10000), little)
      v.setUint32(i * 8 + 4, 10000, little)
    })
    return b
  }
  const ascii = (s) => new Uint8Array([...`${s}\0`].map((c) => c.charCodeAt(0)))

  const push = (list, tag, type, count, bytes) => list.push({ tag, type, count, bytes })

  // Orientation is a SHORT, which lives inside its own entry rather than on
  // the heap — the inline-vs-pointer branch this is here to exercise.
  if (orientation != null) entries0.push({ tag: 0x0112, type: 3, count: 1, short: orientation })
  if (dateTime) push(entriesExif, 0x9003, 2, dateTime.length + 1, ascii(dateTime))
  if (offset) push(entriesExif, 0x9011, 2, offset.length + 1, ascii(offset))
  if (latRef) push(entriesGps, 0x0001, 2, 2, null)
  if (lat) push(entriesGps, 0x0002, 5, 3, rational(lat))
  if (lonRef) push(entriesGps, 0x0003, 2, 2, null)
  if (lon) push(entriesGps, 0x0004, 5, 3, rational(lon))

  // Lay out: IFD0, then Exif IFD, then GPS IFD, then the heap.
  const ifd0Count = entries0.length + (entriesExif.length ? 1 : 0) + (entriesGps.length ? 1 : 0)
  const ifd0At = 8
  const exifAt = ifd0At + 2 + ifd0Count * 12 + 4
  const gpsAt = exifAt + 2 + entriesExif.length * 12 + 4
  let heapAt = gpsAt + 2 + entriesGps.length * 12 + 4

  const tiff = new Uint8Array(4096)
  const dv = new DataView(tiff.buffer)
  dv.setUint16(0, little ? 0x4949 : 0x4d4d)
  dv.setUint16(2, 42, little)
  dv.setUint32(4, ifd0At, little)

  const writeIfd = (at, list, extra = []) => {
    const all = [...list, ...extra]
    dv.setUint16(at, all.length, little)
    all.forEach((e, i) => {
      const o = at + 2 + i * 12
      dv.setUint16(o, e.tag, little)
      dv.setUint16(o + 2, e.type, little)
      dv.setUint32(o + 4, e.count, little)
      if (e.pointer != null) dv.setUint32(o + 8, e.pointer, little)
      else if (e.bytes && e.bytes.length > 4) {
        tiff.set(e.bytes, heapAt)
        dv.setUint32(o + 8, heapAt, little)
        heapAt += e.bytes.length + (e.bytes.length % 2)
      } else if (e.bytes) {
        tiff.set(e.bytes, o + 8)
      } else if (e.short != null) {
        dv.setUint16(o + 8, e.short, little)
      } else if (e.char) {
        tiff.set(new Uint8Array([e.char.charCodeAt(0), 0]), o + 8)
      }
    })
    dv.setUint32(at + 2 + all.length * 12, 0, little)
  }

  if (latRef) entriesGps.find((e) => e.tag === 0x0001).char = latRef
  if (lonRef) entriesGps.find((e) => e.tag === 0x0003).char = lonRef

  const pointers = []
  if (entriesExif.length) pointers.push({ tag: 0x8769, type: 4, count: 1, pointer: exifAt })
  if (entriesGps.length) pointers.push({ tag: 0x8825, type: 4, count: 1, pointer: gpsAt })
  writeIfd(ifd0At, entries0, pointers)
  writeIfd(exifAt, entriesExif)
  writeIfd(gpsAt, entriesGps)

  const tiffLen = heapAt
  const app1Len = 2 + 6 + tiffLen
  const out = new Uint8Array(2 + 2 + app1Len)
  const ov = new DataView(out.buffer)
  ov.setUint16(0, 0xffd8)
  ov.setUint16(2, 0xffe1)
  ov.setUint16(4, app1Len)
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6)
  out.set(tiff.subarray(0, tiffLen), 12)
  return out.buffer
}

test('reads the shutter time, the fix and the rotation out of a little-endian JPEG', () => {
  const e = readExif(
    buildJpeg({
      dateTime: '2025:07:03 08:14:22',
      offset: '+09:00',
      lat: [37, 33, 12.6], latRef: 'N',
      lon: [126, 58, 40.8], lonRef: 'E',
      orientation: 6,
    })
  )
  assert.equal(e.takenLocal, '2025-07-03T08:14:22')
  assert.equal(e.tzOffset, '+09:00')
  assert.equal(e.takenAt, '2025-07-03T08:14:22+09:00')
  assert.equal(e.takenOn, '2025-07-03')
  assert.ok(Math.abs(e.lat - 37.5535) < 0.001, `lat was ${e.lat}`)
  assert.ok(Math.abs(e.lon - 126.9780) < 0.001, `lon was ${e.lon}`)
  assert.equal(e.orientation, 6)
})

test('big-endian files read the same as little-endian ones', () => {
  const e = readExif(
    buildJpeg({ little: false, dateTime: '2019:01:02 03:04:05', lat: [1, 30, 0], latRef: 'N', lon: [2, 0, 0], lonRef: 'E' })
  )
  assert.equal(e.takenOn, '2019-01-02')
  assert.ok(Math.abs(e.lat - 1.5) < 0.001)
  assert.ok(Math.abs(e.lon - 2) < 0.001)
})

test('south and west come back negative', () => {
  const e = readExif(buildJpeg({ lat: [33, 52, 0], latRef: 'S', lon: [151, 12, 0], lonRef: 'W' }))
  assert.ok(e.lat < 0 && Math.abs(e.lat + 33.8667) < 0.001, `lat was ${e.lat}`)
  assert.ok(e.lon < 0 && Math.abs(e.lon + 151.2) < 0.001, `lon was ${e.lon}`)
})

test('a photo with no location still yields its date', () => {
  const e = readExif(buildJpeg({ dateTime: '2024:12:25 10:00:00' }))
  assert.equal(e.takenOn, '2024-12-25')
  assert.equal(e.lat, null)
  assert.equal(e.lon, null)
})

test('without a zone tag the wall clock is read as UTC rather than invented', () => {
  const e = readExif(buildJpeg({ dateTime: '2024:12:25 10:00:00' }))
  assert.equal(e.tzOffset, null)
  assert.equal(e.takenAt, '2024-12-25T10:00:00Z')
})

test('things that are not JPEGs, and JPEGs without EXIF, come back empty not thrown', () => {
  for (const buf of [null, new ArrayBuffer(0), new ArrayBuffer(4), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer]) {
    const e = readExif(buf)
    assert.equal(e.takenAt, null)
    assert.equal(e.lat, null)
  }
})

test('impossible coordinates are dropped rather than plotted', () => {
  const e = readExif(buildJpeg({ lat: [99, 0, 0], latRef: 'N', lon: [200, 0, 0], lonRef: 'E' }))
  assert.equal(e.lat, null)
  assert.equal(e.lon, null)
})
