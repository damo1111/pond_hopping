import { listPicked, readSession, whatToDoWith, worthImporting } from '../src/lib/googlePhotos.js'

// Finishing a pick nobody is watching.
//
// ── What went wrong ──────────────────────────────────────────────────────
//
// Somebody chose seventy photographs in Google's picker. Google showed its
// "Done! Continue in the other app or device" page. Nothing arrived, and
// nothing could be done about it afterwards by anyone.
//
// The picker session id lived in one place: a variable in the browser tab
// that opened it. That tab polled Google, and when the pick landed it read
// the list and queued the import. Signing in again replaced the tab. The id
// went with it, and Google has no endpoint that lists a person's sessions —
// so a session id nobody wrote down is a pick that is gone for good.
//
// ── What this is ─────────────────────────────────────────────────────────
//
// The same loop, on the server, over sessions recorded before the picker was
// ever opened. The browser still does its own polling and still finishes in
// seconds when it is alive; this is what happens when it is not. Whichever
// gets there first wins — finish_picker_session settles the row, so the
// second one finds nothing to do rather than importing everything twice.
//
// ── Who this is ──────────────────────────────────────────────────────────
//
// Nobody, same as api/import-google-photos.js. It holds the shared secret and
// reaches the database only through functions that take it. No authorisation
// is made here: it was made by a person at open_picker_session, against their
// own token, and every row this touches has been through that.

const SUPABASE_URL = 'https://qslksdgxoibzrisywvqk.supabase.co'
const ANON_KEY = 'sb_publishable_HqXFypbh0cTO8Eub41LlQw_8ypkj2tH'

export const config = { maxDuration: 60 }

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
    return said ? JSON.parse(said) : null
  } catch {
    return null
  }
}

/**
 * Ask Google about one session, and carry the status through.
 *
 * readSession throws on a bad status with the number in the message, which
 * is fine for a browser telling somebody something and useless here: the
 * sweep has to tell "Google has forgotten this" apart from "Google had a bad
 * minute", and those differ only by that number. So it is dug back out.
 */
async function askAbout(token, sessionId) {
  try {
    const said = await readSession(token, sessionId)
    return { said, status: 200 }
  } catch (e) {
    const found = /\b(\d{3})\b/.exec(String(e?.message ?? ''))
    return { said: null, status: found ? Number(found[1]) : 0 }
  }
}

export default async function handler(req, res) {
  const secret = process.env.PUSH_SECRET
  if (!secret) {
    res.status(500).json({ error: 'not configured', why: 'PUSH_SECRET' })
    return
  }
  const key = req.query?.key || req.headers['x-pond-key']
  if (key !== secret) {
    res.status(401).json({ error: 'no' })
    return
  }

  let waiting
  try {
    waiting = await rpc('picker_sessions_waiting', { p_secret: secret })
  } catch (e) {
    res.status(500).json({ error: 'could not read the sessions', why: e.message })
    return
  }
  if (!Array.isArray(waiting) || !waiting.length) {
    res.status(200).json({ looked: 0 })
    return
  }

  const done = []
  for (const row of waiting) {
    // Marked as looked at first, so a session that makes this invocation
    // throw is not re-read every minute for the rest of the hour.
    await rpc('picker_session_looked', { p_secret: secret, p_id: row.id }).catch(() => {})

    const { said, status } = await askAbout(row.token, row.session_id)
    const next = whatToDoWith(said, status)

    if (next === 'gone') {
      await rpc('abandon_picker_session', {
        p_secret: secret,
        p_id: row.id,
        p_why: `google no longer knows this session (${status})`,
      }).catch(() => {})
      done.push({ id: row.id, was: 'gone' })
      continue
    }
    if (next === 'wait') {
      done.push({ id: row.id, was: 'waiting' })
      continue
    }

    // Set. Read the whole pick, following Google's paging, and hand it over.
    try {
      const everything = await listPicked(row.token, row.session_id)
      const picked = worthImporting(everything)
      const importId = await rpc('finish_picker_session', {
        p_secret: secret,
        p_id: row.id,
        p_items: picked,
        p_note: 'brought in by the sweep',
      })
      done.push({ id: row.id, was: 'collected', picked: picked.length, importId })
    } catch (e) {
      // Left open on purpose. Reading the list is the one step worth
      // retrying: the pick is still sitting on Google's side and the next
      // tick is a minute away, which is a far better answer than settling
      // the row and losing it — the failure this whole route exists for.
      done.push({ id: row.id, was: 'could not read', why: e.message })
    }
  }

  res.status(200).json({ looked: waiting.length, done })
}
