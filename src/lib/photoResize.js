// Shrink before you send, which is the whole trick.
//
// A 50MP phone photo is 8–12MB. Uploading forty of them from a hotel wifi is
// a coffee break; uploading forty 400KB versions is a few seconds. The full
// resolution buys nothing here — the largest this app ever shows a photo is a
// phone screen, and the recap grid shows it at 200px.

// The long edge, not the width: portrait and landscape should come out the
// same weight. 2048 covers a 3x phone screen at full bleed with room over.
export const DISPLAY = { maxEdge: 2048, quality: 0.82 }
// What the grids and the map card actually render, stored rather than asked
// of the transform endpoint — twelve concurrent renders is what broke the
// recap grid, and a stored file has no such failure mode.
export const THUMB = { maxEdge: 400, quality: 0.78 }

/** Never upscales: a small photo stays its own size rather than being blown up. */
export function fitWithin(width, height, maxEdge) {
  const w = Math.max(1, Math.round(width || 0))
  const h = Math.max(1, Math.round(height || 0))
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/** A rough guide before any work is done, for showing what the upload saved. */
export function savingsLabel(before, after) {
  if (!before || !after) return null
  const pct = Math.max(0, Math.round((1 - after / before) * 100))
  return `${(before / 1e6).toFixed(1)} MB → ${(after / 1e3).toFixed(0)} KB · ${pct}% smaller`
}

// WebP is 25–35% smaller than JPEG at the same quality and is supported
// everywhere that matters now; the check is cheap and the fallback is honest.
let cachedType = null
export function outputType() {
  if (cachedType) return cachedType
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    cachedType = c.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg'
  } catch {
    cachedType = 'image/jpeg'
  }
  return cachedType
}

export const extFor = (mime) => (mime === 'image/webp' ? 'webp' : 'jpg')

async function toBlob(canvas, mime, quality) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: mime, quality })
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), mime, quality)
  )
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}

/**
 * Decode once, then draw that one bitmap at each size we need. Decoding a
 * 50MP JPEG is the expensive step; doing it twice to get a display copy and a
 * thumbnail would double the cost of the whole operation.
 *
 * `imageOrientation: 'from-image'` applies the EXIF rotation during decode,
 * which matters because the re-encoded file won't carry the tag that would
 * otherwise tell a viewer to rotate it — a portrait photo would come out on
 * its side.
 *
 * @param {Blob} file
 * @param {Array<{maxEdge:number, quality:number}>} sizes
 * @returns {Promise<Array<{blob: Blob, width: number, height: number, type: string}>>}
 */
export async function renderSizes(file, sizes) {
  const mime = outputType()
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const out = []
    for (const size of sizes) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, size.maxEdge)
      const canvas = makeCanvas(width, height)
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, width, height)
      out.push({ blob: await toBlob(canvas, mime, size.quality), width, height, type: mime })
    }
    return out
  } finally {
    // Without this the decoded bitmap — potentially 200MB for a 50MP shot —
    // waits on the garbage collector, and a run of forty photos doesn't wait
    // that politely.
    bitmap.close?.()
  }
}
