// Uploads a base64-encoded image into Storage and sets it as a trip's
// cover in photo_cache. Runs as a Vercel Node function (not client-side)
// because the source is often a raw file the caller has on disk, not yet
// a fetchable URL — and because Postgres's pg_net (used to trigger this
// from SQL/automation) can only send JSON bodies, never raw binary, so a
// base64-in-JSON envelope decoded here is the only way to get arbitrary
// bytes into Storage from that path.
const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }

  try {
    const { trip_id, image_base64, content_type } = req.body || {}
    if (!trip_id || !image_base64) {
      res.status(400).json({ error: 'trip_id and image_base64 required' })
      return
    }

    const buf = Buffer.from(image_base64, 'base64')
    const ext = (content_type || 'image/jpeg').includes('png') ? 'png' : 'jpg'
    const destPath = `covers/${trip_id}.${ext}`

    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/photos/${destPath}`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': content_type || 'image/jpeg',
        'x-upsert': 'true',
      },
      body: buf,
    })
    if (!upRes.ok) {
      res.status(502).json({ error: `storage upload failed: ${await upRes.text()}` })
      return
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/photos/${destPath}`
    await fetch(`${SUPABASE_URL}/rest/v1/photo_cache?on_conflict=trip_id`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ trip_id, urls: [publicUrl], status: 'ok', updated_at: new Date().toISOString() }),
    })

    res.status(200).json({ ok: true, url: publicUrl })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
