import { supabase } from './supabase.js'
import { begin } from './busy.js'
import { readExif } from './exif.js'
import { renderSizes, DISPLAY, THUMB, extFor } from './photoResize.js'

const BUCKET = 'photos'

// Three at a time. One is slow on a good connection; ten is slow on a bad one
// because they all contend, and on a phone ten simultaneous decodes is also
// ten simultaneous 200MB bitmaps.
const CONCURRENCY = 3

// EXIF lives in the first APP1 segment, right after the two-byte magic. A
// quarter of a megabyte is generous even for files with a fat thumbnail in
// there; reading the other eleven megabytes to find it would be the slowest
// part of the whole operation.
export const HEAD_BYTES = 256 * 1024

/** Read the metadata, then make the two sizes we actually store. */
export async function prepare(file) {
  const exif = readExif(await file.slice(0, HEAD_BYTES).arrayBuffer())
  const [display, thumb] = await renderSizes(file, [DISPLAY, THUMB])
  return { file, exif, display, thumb, originalBytes: file.size }
}

function publicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Upload both sizes and write the row. The EXIF goes into columns rather than
 * staying in the file — the file we upload has been through a canvas and
 * carries no metadata at all, which is how a shared album stops being a map
 * of where someone lives.
 */
export async function store(prepared, { tripId, traveler = null, isHighlight = false } = {}) {
  const { exif, display, thumb } = prepared
  const ext = extFor(display.type)
  const id = crypto.randomUUID()
  const base = `${tripId}/${id}`

  const opts = { contentType: display.type, cacheControl: '31536000', upsert: false }
  const up = await supabase.storage.from(BUCKET).upload(`${base}.${ext}`, display.blob, opts)
  if (up.error) throw up.error
  const upThumb = await supabase.storage.from(BUCKET).upload(`${base}-thumb.${ext}`, thumb.blob, opts)
  if (upThumb.error) throw upThumb.error

  const row = {
    trip_id: tripId,
    url: publicUrl(up.data.path),
    thumb_url: publicUrl(upThumb.data.path),
    taken_on: exif.takenOn,
    taken_at: exif.takenAt,
    lat: exif.lat,
    lon: exif.lon,
    traveler,
    is_highlight: isHighlight,
  }
  const { data, error } = await supabase.from('photos').insert(row).select().single()
  if (error) {
    // The row is what makes the file findable; an orphan in the bucket is
    // invisible and costs storage forever.
    await supabase.storage.from(BUCKET).remove([`${base}.${ext}`, `${base}-thumb.${ext}`])
    throw error
  }
  return data
}

/**
 * Run a whole selection through, a few at a time, reporting each one as it
 * lands so the list can fill in rather than sitting on a spinner.
 *
 * A failure is per-photo: one unreadable file out of forty should not lose
 * the other thirty-nine.
 */
export async function ingest(files, { tripId, traveler, onProgress } = {}) {
  const list = [...files]
  const results = new Array(list.length)
  let next = 0

  const report = (i, state, extra) => {
    results[i] = { name: list[i].name, state, ...extra }
    onProgress?.(i, results[i], results)
  }

  list.forEach((f, i) => (results[i] = { name: f.name, state: 'waiting' }))
  onProgress?.(-1, null, results)

  async function worker() {
    for (;;) {
      const i = next++
      if (i >= list.length) return
      try {
        report(i, 'shrinking')
        const prepared = await prepare(list[i])
        report(i, 'uploading', { bytes: prepared.display.blob.size, originalBytes: prepared.originalBytes })
        const photo = await store(prepared, { tripId, traveler })
        report(i, 'done', {
          bytes: prepared.display.blob.size,
          originalBytes: prepared.originalBytes,
          located: prepared.exif.lat != null,
          photo,
        })
      } catch (e) {
        report(i, 'failed', { error: e?.message || String(e) })
      }
    }
  }

  // Held open for the whole run, so a service-worker update that lands
  // mid-upload waits rather than reloading the app out from under it. Two
  // photographs were lost exactly that way: switch apps for a moment, come
  // back to a freshly booted app and nothing to show for it.
  const done = begin()
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker))
  } finally {
    done()
  }
  return results
}

/** What the whole run saved, for saying so afterwards. */
export function runTotals(results = []) {
  const done = results.filter((r) => r?.state === 'done')
  return {
    done: done.length,
    failed: results.filter((r) => r?.state === 'failed').length,
    located: done.filter((r) => r.located).length,
    before: done.reduce((s, r) => s + (r.originalBytes || 0), 0),
    after: done.reduce((s, r) => s + (r.bytes || 0), 0),
  }
}
