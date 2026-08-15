import { preflight } from './_lib/cors.js'
import sharp from 'sharp'
import { readExif } from '../src/lib/exif.js'
import { originalUrl } from '../src/lib/googlePhotos.js'
import { DISPLAY, THUMB } from '../src/lib/photoResize.js'

// One batch of somebody's photographs, brought in from Google by nobody in
// particular.
//
// A trip taken months ago lives in Google's cloud, not on the handset, so
// getting it into the app meant Google → phone → browser → Supabase: two
// full transfers of eleven-megabyte files for something that begins and ends
// in a data centre. This is the other route. The phone picks, and sends a
// list of ids; the bytes never go near it.
//
// ── Why a queue and not a loop in the app ────────────────────────────────
//
// Because a thousand photographs is fifteen minutes, and no phone stays
// awake and in the foreground for fifteen minutes. The moment the screen
// locks or somebody switches apps, mobile browsers suspend the tab — the
// import would not fail, it would stop, silently, half done. So the record
// of where things got to is photo_imports, and pg_cron turns the handle once
// a minute, exactly as story_runs already does.
//
// ── Who this is ─────────────────────────────────────────────────────────
//
// Nobody, same as api/story-step.js. There is no signed-in person behind a
// cron tick. It holds the shared secret Vercel already has as PUSH_SECRET
// and reaches the database only through functions that take that secret.
// The authorisation happened earlier and by somebody real: start_photo_import
// checks is_trip_editor() against their own token, and no row reaches this
// worker without having been through it.

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

// Writing to somebody's storage is a server's job, not the public key's.
//
// The anon key ships inside the app, so anything it is allowed to do,
// everybody is allowed to do — and this uploads into other people's trips.
// While the workers held it, the bucket had to accept writes from anon,
// which meant anyone could overwrite anyone's photograph.
//
// Falls back to the anon key when the service role is not configured, so a
// deploy without the variable keeps working exactly as before rather than
// failing at the first upload. The bucket is only locked down once this is
// set — see the migration that scopes INSERT and UPDATE to authenticated.
const WRITE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON_KEY

/** One batch a tick. Small enough that a failure costs eight photographs
 *  rather than a thousand, big enough to finish inside Google's hour. */
/**
 * How long this invocation may run.
 *
 * Absent, so Vercel's default applied — ten seconds — and the worker was
 * sized to fit inside it: one batch of eight and out. Combined with the
 * fifteen-minute lease in photo_imports_waiting that produced eight
 * photographs per fifteen minutes, which on a real import of 1,203 was
 * thirty-seven hours. Both halves had to move; this is the other one.
 */
export const config = { maxDuration: 60 }

/** Stop claiming new batches with this much of the budget left, so the work
 *  already in flight finishes and settles rather than being killed mid-upload
 *  and retried from the top. */
const LEAVE_SPARE_MS = 14000

export const PER_TICK = 8

/** How many at a time within the batch. Each one is a download, a decode and
 *  two uploads; four in flight keeps the network busy without four 50MP
 *  decodes sharing the same 1GB of memory. */
const AT_ONCE = 4

/** EXIF lives at the front, and a quarter of a megabyte is generous — the
 *  same window the phone reads. */
const HEAD_BYTES = 256 * 1024

async function rpc(name, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const said = await r.text()
  if (!r.ok) throw new Error(`${name} — ${r.status} ${said.slice(0, 200)}`)
  try {
    return JSON.parse(said)
  } catch {
    return null
  }
}

/**
 * The same digest the phone computes, over the same bytes.
 *
 * It has to match exactly or a photograph picked off the handset and later
 * picked again from Google would not be recognised as the same one. Node has
 * had webcrypto on globalThis since 18, so this is character-for-character
 * what alreadyHere.js does rather than a second implementation that happens
 * to agree today.
 */
async function fingerprintOf(head, size) {
  try {
    const digest = await globalThis.crypto?.subtle?.digest('SHA-256', head)
    if (!digest) return null
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${size}-${hex.slice(0, 32)}`
  } catch {
    return null
  }
}

/**
 * The original, with everything still on it.
 *
 * `=d` is what makes the metadata survive: without it Google hands back a
 * render it has already stripped, and the coordinates — which the API will
 * not give us at any scope, at all — are gone with it. So the original is
 * always what gets fetched, whatever ends up being displayed.
 */
async function fetchOriginal(fetchFrom, token) {
  const r = await fetch(originalUrl(fetchFrom), { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`google said ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

/**
 * Pixels, from whichever copy this machine can actually decode.
 *
 * An iPhone photograph comes back from `=d` as HEIC, and sharp only decodes
 * HEIC where libvips was built with libheif — which is not something to
 * discover halfway through somebody's library. Google will render the same
 * photograph as JPEG on request, so that is the fallback.
 *
 * Deliberately only for the *pixels*. The metadata has already been read off
 * the original above, because Google's render has none — falling back for
 * both would put every iPhone photograph on the map at nowhere.
 */
async function pixelsFrom(original, fetchFrom, token) {
  try {
    await sharp(original).metadata()
    return original
  } catch {
    const r = await fetch(`${fetchFrom}=w${DISPLAY.maxEdge}-h${DISPLAY.maxEdge}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) throw new Error(`no decodable copy (google render ${r.status})`)
    return Buffer.from(await r.arrayBuffer())
  }
}

/** The two sizes the phone makes, made the same way. `.rotate()` first so
 *  EXIF orientation is applied before the resize rather than lost with it. */
async function renderBoth(pixels) {
  const of = (spec) =>
    sharp(pixels)
      .rotate()
      .resize({ width: spec.maxEdge, height: spec.maxEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: Math.round(spec.quality * 100) })
      .toBuffer()
  return Promise.all([of(DISPLAY), of(THUMB)])
}

async function putObject(path, body) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/photos/${path}`, {
    method: 'POST',
    headers: {
      apikey: WRITE_KEY,
      Authorization: `Bearer ${WRITE_KEY}`,
      'Content-Type': 'image/webp',
      'x-upsert': 'true',
    },
    body,
  })
  if (!r.ok) throw new Error(`upload ${r.status}: ${(await r.text()).slice(0, 150)}`)
  return `${SUPABASE_URL}/storage/v1/object/public/photos/${path}`
}

/** One photograph, all the way in. Throws, and the caller records why. */
async function bringIn(secret, item) {
  const original = await fetchOriginal(item.fetch_from, item.token)
  // Read before anything is re-encoded — the whole reason the original is
  // fetched rather than a render.
  const exif = readExif(
    original.buffer.slice(original.byteOffset, original.byteOffset + Math.min(HEAD_BYTES, original.byteLength))
  )
  const fingerprint = await fingerprintOf(
    original.buffer.slice(original.byteOffset, original.byteOffset + Math.min(HEAD_BYTES, original.byteLength)),
    original.byteLength
  )

  const pixels = await pixelsFrom(original, item.fetch_from, item.token)
  const [display, thumb] = await renderBoth(pixels)

  const stem = `${item.trip_id}/${item.item_id}`
  const [url, thumbUrl] = await Promise.all([
    putObject(`${stem}.webp`, display),
    putObject(`${stem}-thumb.webp`, thumb),
  ])

  return rpc('photo_import_store', {
    p_secret: secret,
    p_item: item.item_id,
    p_url: url,
    p_thumb: thumbUrl,
    p_fingerprint: fingerprint,
    // EXIF first, Google's creation time only where the EXIF was already
    // stripped. The API's answer is a hint; the file is the record.
    p_taken_at: exif.takenAt ?? item.taken_at_hint ?? null,
    p_lat: exif.lat,
    p_lon: exif.lon,
  })
}

export default async function handler(req, res) {
  if (preflight(req, res)) return
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  const secret = process.env.PUSH_SECRET
  // A wrong key gets the same answer as a right one with nothing to do, so
  // this endpoint cannot be used to find out whether it is configured.
  if (!secret || (req.query?.key || '') !== secret) {
    res.status(200).json({ ok: true })
    return
  }

  const importId = req.body?.import_id
  if (!importId) {
    res.status(400).json({ error: 'import_id required' })
    return
  }

  const began = Date.now()
  const budgetLeft = () => config.maxDuration * 1000 - (Date.now() - began)

  let done = 0
  let skipped = 0
  let failed = 0

  /** One claimed batch, AT_ONCE in flight. Each photograph settles on its
   *  own, so one bad file never takes the batch down with it. */
  async function workThrough(batch) {
    for (let i = 0; i < batch.length; i += AT_ONCE) {
      const slice = batch.slice(i, i + AT_ONCE)
      await Promise.all(
        slice.map(async (item) => {
          try {
            const how = await bringIn(secret, item)
            if (how === 'skipped') skipped += 1
            else done += 1
            await rpc('photo_import_settled', {
              p_secret: secret,
              p_item: item.item_id,
              p_state: how === 'skipped' ? 'skipped' : 'done',
            })
          } catch (e) {
            failed += 1
            console.error(`import-google-photos: ${item.google_id} — ${e.message}`)
            await rpc('photo_import_settled', {
              p_secret: secret,
              p_item: item.item_id,
              p_state: 'failed',
              p_note: e.message,
            }).catch(() => {})
          }
        })
      )
    }
  }

  try {
    let rounds = 0

    // Keep going while there is both work and time.
    //
    // One batch and out was sized for the ten-second default this no longer
    // runs under. Each round claims afresh, so nothing is held across the
    // whole invocation and a worker that dies has only its current eight to
    // redo — which is what the lease in photo_imports_waiting is for, now
    // that it is ninety seconds rather than fifteen minutes.
    while (budgetLeft() > LEAVE_SPARE_MS) {
      const batch = (await rpc('photo_import_batch', {
        p_secret: secret,
        p_import: importId,
        p_limit: PER_TICK,
      })) ?? []

      if (!batch.length) {
        // Nothing left. Only closed on the first round: a later round
        // finding nothing means this invocation drained the queue, and the
        // tick closes finished runs anyway.
        if (rounds === 0) {
          await rpc('photo_import_finished', { p_secret: secret, p_import: importId }).catch(() => {})
        }
        break
      }
      rounds += 1
      await workThrough(batch)
    }

    res.status(200).json({ ok: true, done, skipped, failed, rounds, ms: Date.now() - began })
  } catch (e) {
    console.error(`import-google-photos: ${e.message}`)
    // Left unfinished on purpose: the next tick tries again, and
    // photo_imports_waiting lets a run that has gone quiet be taken over
    // after ninety seconds. Whatever settled before the throw stays settled.
    res.status(502).json({ error: e.message })
  }
}
