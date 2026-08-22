import { supabase } from './supabase.js'
import { begin } from './busy.js'
import { drop, hold, queued } from './originals.js'
import { readExif } from './exif.js'
import { fingerprintOf } from './alreadyHere.js'
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
  const head = await file.slice(0, HEAD_BYTES).arrayBuffer()
  const exif = readExif(head)
  // Free, because the head is already in hand for the EXIF. It is what lets
  // the same camera roll be offered twice without going up twice.
  const fingerprint = await fingerprintOf(head, file.size)
  const [display, thumb] = await renderSizes(file, [DISPLAY, THUMB])
  return { file, exif, fingerprint, display, thumb, originalBytes: file.size }
}

function publicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * A picture for the top of a trip, straight off the phone.
 *
 * The cover used to be a URL you pasted in, which is a thing nobody has ever
 * had to hand — David, 12 August: "on a new trip why are we asking hoppers
 * to paste an image — isn't it all upload now?" It is, everywhere else.
 *
 * Deliberately not a `photos` row: a cover is decoration, not a record of
 * having been somewhere, and putting it in the gallery would drop an
 * undated, unplaced picture into the map, the day strip and the trip's own
 * photo count. It goes in the same bucket under its own name and its URL is
 * kept where the guessed covers already live.
 */
export async function uploadCover(file, tripId) {
  const [display] = await renderSizes(file, [DISPLAY])
  const ext = extFor(display.type)
  const path = `${tripId}/cover-${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage.from(BUCKET).upload(path, display.blob, {
    contentType: display.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (up.error) throw up.error
  return publicUrl(up.data.path)
}

/**
 * Upload both sizes and write the row. The EXIF goes into columns rather than
 * staying in the file — the file we upload has been through a canvas and
 * carries no metadata at all, which is how a shared album stops being a map
 * of where someone lives.
 */
export async function store(prepared, { tripId, traveler = null, isHighlight = false, keepOriginal = false } = {}) {
  const { exif, display, thumb, fingerprint } = prepared
  const ext = extFor(display.type)
  const id = crypto.randomUUID()

  // A photograph with no trip goes under whoever took it instead.
  //
  // The path is not decoration. Storage's policies read the first segment as
  // a trip id and ask whether you may edit that trip — which is why a loose
  // photograph could not be stored at all before this: with no trip there is
  // no segment to check, and `null/…` is not a uuid, so the upload was
  // refused before the row was ever attempted. `loose/<your uid>/` asks the
  // same question a different way, and the three storage policies now know
  // about it.
  let base = `${tripId}/${id}`
  if (!tripId) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    // No session, no owner, nowhere it could legally go — and the row would
    // be ownerless too. Better to say so than to write something nobody can
    // ever read back.
    if (!user) throw new Error('Sign in first and these will be kept for you.')
    base = `loose/${user.id}/${id}`
  }

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
    fingerprint: fingerprint ?? null,
  }
  const { data, error } = await supabase.from('photos').insert(row).select().single()
  if (error) {
    // The row is what makes the file findable; an orphan in the bucket is
    // invisible and costs storage forever.
    await supabase.storage.from(BUCKET).remove([`${base}.${ext}`, `${base}-thumb.${ext}`])
    throw error
  }

  // Kept on the phone rather than sent now, because sending it now is the
  // thing that makes uploading on hotel wifi unbearable — which is the
  // whole reason the app shrinks these in the first place. It goes when
  // somebody says so, from Account. Failure here is swallowed: the
  // photograph is already safely up, and a full disk must not turn a
  // successful upload into a failed one.
  if (keepOriginal) await hold({ id: data.id, blob: prepared.file, name: prepared.file?.name })

  return data
}

/**
 * Send one held original and point its row at it.
 *
 * The display copy is untouched — url and thumb_url still serve every
 * screen. This only ever fills in original_url, so a half-drained queue is
 * a partial backup rather than a broken gallery.
 */
export async function sendOriginal(row) {
  const file = row?.blob
  if (!file) {
    await drop(row?.id)
    return false
  }
  const name = row.name || 'original'
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : 'jpg'
  const path = `originals/${row.id}.${ext}`

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '31536000',
    upsert: true,
  })
  if (up.error) throw up.error

  const { error } = await supabase
    .from('photos')
    .update({ original_url: publicUrl(up.data.path) })
    .eq('id', row.id)
  // The file is uploaded but unrecorded, so leave it queued: retrying
  // overwrites the same path rather than piling up copies, which is why
  // upsert is on.
  if (error) throw error

  await drop(row.id)
  return true
}

/** Everything still held on this phone. */
export { queued }

/**
 * Run a whole selection through, a few at a time, reporting each one as it
 * lands so the list can fill in rather than sitting on a spinner.
 *
 * A failure is per-photo: one unreadable file out of forty should not lose
 * the other thirty-nine.
 */
export async function ingest(files, { tripId, traveler, onProgress, keepOriginals = false } = {}) {
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
        // The thumbnail already exists by this point, so the picture can be
        // on screen while it is still going up rather than after. Revoked by
        // the caller — see PhotoUpload.
        report(i, 'uploading', {
          bytes: prepared.display.blob.size,
          originalBytes: prepared.originalBytes,
          preview: URL.createObjectURL(prepared.thumb.blob),
          located: prepared.exif.lat != null,
        })
        const photo = await store(prepared, { tripId, traveler, keepOriginal: keepOriginals })
        report(i, 'done', {
          bytes: prepared.display.blob.size,
          originalBytes: prepared.originalBytes,
          located: prepared.exif.lat != null,
          preview: results[i]?.preview ?? null,
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
