// The four things a travel log wants out of a photo: when the shutter fired,
// where it fired, and which way up the camera was.
//
// Written out rather than pulled from a library because it is four tags and
// the alternative is 40KB in the bundle for the other two hundred. It reads
// JPEG only, which in practice is everything: iOS hands `<input type=file>`
// a transcoded JPEG rather than the original HEIC, and Android cameras write
// JPEG by default.
//
// This runs before the pixels are re-encoded, because re-encoding through a
// canvas destroys EXIF — which is also the privacy win. What we keep, we keep
// in columns we control; the file that gets uploaded carries no GPS at all.

const TAG = {
  ORIENTATION: 0x0112,
  EXIF_IFD: 0x8769,
  GPS_IFD: 0x8825,
  DATE_ORIGINAL: 0x9003,
  OFFSET_ORIGINAL: 0x9011,
  GPS_LAT_REF: 0x0001,
  GPS_LAT: 0x0002,
  GPS_LON_REF: 0x0003,
  GPS_LON: 0x0004,
}

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 }

// Walk the JPEG marker chain looking for APP1/Exif. Not every APP1 is EXIF —
// XMP also lives in one — so the signature is checked rather than assumed.
function findExifStart(view) {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return -1
  let off = 2
  while (off + 4 <= view.byteLength) {
    if (view.getUint8(off) !== 0xff) return -1
    const marker = view.getUint8(off + 1)
    // Start of scan: pixels from here on, no more metadata to find.
    if (marker === 0xda) return -1
    const len = view.getUint16(off + 2)
    if (len < 2) return -1
    if (marker === 0xe1 && off + 10 <= view.byteLength) {
      let sig = ''
      for (let i = 0; i < 4; i++) sig += String.fromCharCode(view.getUint8(off + 4 + i))
      if (sig === 'Exif') return off + 10
    }
    off += 2 + len
  }
  return -1
}

function readValue(view, tiff, little, type, count, entryOff) {
  const size = (TYPE_SIZE[type] || 0) * count
  if (!size) return null
  // Four bytes or fewer live in the entry itself; anything longer is a
  // pointer relative to the start of the TIFF header.
  const at = size <= 4 ? entryOff + 8 : tiff + view.getUint32(entryOff + 8, little)
  if (at < 0 || at + size > view.byteLength) return null

  if (type === 2) {
    let s = ''
    for (let i = 0; i < count; i++) {
      const c = view.getUint8(at + i)
      if (c === 0) break
      s += String.fromCharCode(c)
    }
    return s
  }
  if (type === 5 || type === 10) {
    const out = []
    for (let i = 0; i < count; i++) {
      const num = type === 5 ? view.getUint32(at + i * 8, little) : view.getInt32(at + i * 8, little)
      const den = type === 5 ? view.getUint32(at + i * 8 + 4, little) : view.getInt32(at + i * 8 + 4, little)
      out.push(den === 0 ? 0 : num / den)
    }
    return count === 1 ? out[0] : out
  }
  if (type === 3) return view.getUint16(at, little)
  if (type === 4) return view.getUint32(at, little)
  return null
}

function readIfd(view, tiff, offset, little) {
  const out = new Map()
  if (offset + 2 > view.byteLength) return out
  const n = view.getUint16(offset, little)
  for (let i = 0; i < n; i++) {
    const entry = offset + 2 + i * 12
    if (entry + 12 > view.byteLength) break
    const tag = view.getUint16(entry, little)
    const type = view.getUint16(entry + 2, little)
    const count = view.getUint32(entry + 4, little)
    // A corrupt count can ask for gigabytes; nothing we read is long.
    if (count > 0xffff) continue
    const value = readValue(view, tiff, little, type, count, entry)
    if (value !== null) out.set(tag, value)
  }
  return out
}

// Degrees, minutes, seconds → a signed decimal. S and W are the negatives.
function dms(parts, ref) {
  if (!Array.isArray(parts) || parts.length < 2) return null
  const [d = 0, m = 0, s = 0] = parts
  const v = d + m / 60 + s / 3600
  if (!Number.isFinite(v)) return null
  const neg = ref === 'S' || ref === 'W'
  return neg ? -v : v
}

// EXIF writes "2025:07:03 08:14:22" — colons in the date, and no zone. The
// zone is a separate, frequently absent tag, which is why this returns the
// wall time and the offset apart rather than pretending to know an instant.
function isoLocal(dateTime) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(dateTime || ''))
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`
}

/**
 * @param {ArrayBuffer} buf the first few tens of KB of a JPEG is plenty
 * @returns {{ takenLocal: string|null, tzOffset: string|null, takenAt: string|null,
 *             takenOn: string|null, lat: number|null, lon: number|null,
 *             orientation: number|null }}
 */
export function readExif(buf) {
  const empty = {
    takenLocal: null, tzOffset: null, takenAt: null, takenOn: null,
    lat: null, lon: null, orientation: null,
  }
  if (!buf || buf.byteLength < 8) return empty
  const view = new DataView(buf)
  const tiff = findExifStart(view)
  if (tiff < 0 || tiff + 8 > view.byteLength) return empty

  const order = view.getUint16(tiff)
  if (order !== 0x4949 && order !== 0x4d4d) return empty
  const little = order === 0x4949
  if (view.getUint16(tiff + 2, little) !== 42) return empty

  const ifd0 = readIfd(view, tiff, tiff + view.getUint32(tiff + 4, little), little)
  const exif = ifd0.has(TAG.EXIF_IFD) ? readIfd(view, tiff, tiff + ifd0.get(TAG.EXIF_IFD), little) : new Map()
  const gps = ifd0.has(TAG.GPS_IFD) ? readIfd(view, tiff, tiff + ifd0.get(TAG.GPS_IFD), little) : new Map()

  const takenLocal = isoLocal(exif.get(TAG.DATE_ORIGINAL))
  const rawOffset = exif.get(TAG.OFFSET_ORIGINAL)
  const tzOffset = /^[+-]\d{2}:\d{2}$/.test(String(rawOffset || '')) ? String(rawOffset) : null

  const latParts = gps.get(TAG.GPS_LAT)
  const lonParts = gps.get(TAG.GPS_LON)
  const lat = dms(latParts, gps.get(TAG.GPS_LAT_REF))
  const lon = dms(lonParts, gps.get(TAG.GPS_LON_REF))

  return {
    takenLocal,
    tzOffset,
    // With an offset this is the real instant. Without one, all we honestly
    // have is a wall clock; UTC is the least-wrong reading of it and the
    // date — which is what the timeline actually groups by — survives it.
    takenAt: takenLocal ? `${takenLocal}${tzOffset ?? 'Z'}` : null,
    takenOn: takenLocal ? takenLocal.slice(0, 10) : null,
    lat: lat !== null && Math.abs(lat) <= 90 ? lat : null,
    lon: lon !== null && Math.abs(lon) <= 180 ? lon : null,
    orientation: ifd0.get(TAG.ORIENTATION) ?? null,
  }
}
