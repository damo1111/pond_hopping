import { preflight } from './_lib/cors.js'
import sharp from 'sharp'

// Generates a small static JPEG thumbnail (once, forever) for photos that
// don't have one yet. Runs as a Vercel Node.js serverless function rather
// than a Supabase Edge Function specifically because the 50MP camera
// originals are too large for both a WASM-based in-process decode (blows
// the Edge Function memory limit) and for Supabase's own render/image
// transform endpoint ("source image resolution is too large to process").
// sharp is a native libvips binding that handles images this size easily.
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
const LONG_EDGE = 640
const QUALITY = 72

export default async function handler(req, res) {
  // No method guard on this one, so nothing was rejecting a preflight —
  // but nothing was answering one either, and an OPTIONS falling through
  // into the body would go off and resize photographs.
  if (preflight(req, res)) return
  const limit = Number(req.query?.limit ?? req.body?.limit ?? 20)

  const listRes = await fetch(
    `${SUPABASE_URL}/rest/v1/photos?select=id,url&thumb_url=is.null&limit=${limit}`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
  )
  if (!listRes.ok) {
    res.status(500).json({ error: `list failed: ${listRes.status}` })
    return
  }
  const photos = await listRes.json()

  let done = 0
  let thumbBytes = 0
  const errors = []

  for (const p of photos) {
    try {
      const marker = '/storage/v1/object/public/photos/'
      const idx = p.url.indexOf(marker)
      if (idx === -1) throw new Error('unexpected url shape')
      const relPath = p.url.slice(idx + marker.length)

      const imgRes = await fetch(p.url)
      if (!imgRes.ok) throw new Error(`fetch original ${imgRes.status}`)
      const buf = Buffer.from(await imgRes.arrayBuffer())

      const resized = await sharp(buf)
        .rotate() // respect EXIF orientation before resizing
        .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: QUALITY })
        .toBuffer()
      thumbBytes += resized.byteLength

      const destPath = `thumb/${relPath}`
      const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/photos/${destPath}`, {
        method: 'POST',
        headers: {
          apikey: WRITE_KEY,
          Authorization: `Bearer ${WRITE_KEY}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: resized,
      })
      if (!upRes.ok) throw new Error(`upload ${upRes.status}: ${(await upRes.text()).slice(0, 150)}`)

      // photos.UPDATE is scoped to trip editors, and this job has no user
      // session — so it goes through api_set_photo_thumb, which can set
      // thumb_url and nothing else. See the function's comment in
      // supabase/migrations_2026_08_sharing_and_connectors.sql.
      const thumbUrl = `${SUPABASE_URL}/storage/v1/object/public/photos/${destPath}`
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/api_set_photo_thumb`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_id: p.id, p_thumb: thumbUrl }),
      })
      if (!patchRes.ok) throw new Error(`patch ${patchRes.status}`)
      done++
    } catch (e) {
      errors.push(`${p.id}: ${e.message}`)
    }
  }

  res.status(200).json({ batch_size: photos.length, processed: done, thumb_bytes: thumbBytes, errors })
}
