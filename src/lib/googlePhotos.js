// Bringing photographs in from Google Photos without them touching the phone.
//
// A trip taken months ago lives in Google's cloud, not on the handset. Today
// getting it into the app means Google → phone → browser → Supabase: two full
// transfers of eleven-megabyte files for something that begins and ends in a
// data centre. For a thousand photographs that is not friction, it is a wall,
// and PhotosTab already had a card admitting as much — "the photographs are
// still outside, in Google Photos, where it is the only way to reach them".
//
// The Picker API turns it round. The hopper chooses inside Google's own
// picker, the app receives a list of ids, and the server does the fetching.
// The phone sends a few hundred bytes of JSON and nothing else.
//
// ── The sixty-minute rule ─────────────────────────────────────────────
//
// `baseUrl` is a fetch handle, not a link. It stops working about an hour
// after it is issued, so it can never be stored as a photo's url — do that
// and every photograph 404s the same evening. The bytes have to be copied.
//
// This is NOT the same as an lh3.googleusercontent.com url from a public
// shared album, which is long-lived and *can* be referenced. The two look
// identical and behave completely differently. The only durable handle here
// is the product url, which is what "open in Google Photos" should use.
//
// ── Why the metadata still comes off the bytes ────────────────────────
//
// The API deliberately does not return where a photograph was taken. There
// is no lat/lon anywhere in the picked item, at any scope — Google treats
// location as too sensitive to hand over in metadata. It is still in the
// EXIF of the original, which is one more reason the server fetches the
// original rather than a rendered copy: `readExif()`, the same function the
// phone uses, is the source of truth for both time and place. `createTime`
// below is a fallback for the photographs whose EXIF was already stripped.

const PICKER = 'https://photospicker.googleapis.com/v1'

/** The one scope this needs. Deliberately separate from the Gmail and
 *  Calendar scopes in google.js: somebody who wants their photographs in
 *  should not be asked for their inbox in the same breath. */
export const PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly'

const asJson = async (res, what) => {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${what} failed: ${res.status}${body ? ` ${body.slice(0, 200)}` : ''}`)
  }
  return res.json()
}

const auth = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

/** Open a picking session. Hand `pickerUri` to the hopper. */
export async function openSession(token, { fetchImpl = fetch } = {}) {
  if (!token) throw new Error('not connected to Google')
  return asJson(await fetchImpl(`${PICKER}/sessions`, { method: 'POST', headers: auth(token) }), 'session')
}

/** Has anything been picked yet? */
export async function readSession(token, sessionId, { fetchImpl = fetch } = {}) {
  return asJson(
    await fetchImpl(`${PICKER}/sessions/${encodeURIComponent(sessionId)}`, { headers: auth(token) }),
    'session read'
  )
}

/**
 * How long to wait before asking again.
 *
 * Google returns its own interval and we honour it — polling faster than
 * asked is how an integration gets rate-limited — but never slower than a
 * second, because somebody is watching a spinner, and never faster than one
 * either. Their format is protobuf duration ("2.5s"), not a number.
 */
export function pollDelay(pollingConfig, { min = 1000, max = 10000 } = {}) {
  const raw = String(pollingConfig?.pollInterval ?? '')
  const seconds = Number(raw.endsWith('s') ? raw.slice(0, -1) : raw)
  if (!Number.isFinite(seconds) || seconds <= 0) return min
  return Math.min(max, Math.max(min, Math.round(seconds * 1000)))
}

/** Everything picked, following Google's paging to the end. */
export async function listPicked(token, sessionId, { fetchImpl = fetch, pageSize = 100 } = {}) {
  const items = []
  let pageToken = null
  do {
    const url = new URL(`${PICKER}/mediaItems`)
    url.searchParams.set('sessionId', sessionId)
    url.searchParams.set('pageSize', String(pageSize))
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const page = await asJson(await fetchImpl(url.toString(), { headers: auth(token) }), 'media items')
    items.push(...(page.mediaItems ?? []))
    pageToken = page.nextPageToken ?? null
  } while (pageToken)
  return items
}

/** Let go of the session. Failure is swallowed: the session expires on its
 *  own, and an import that worked should not report an error because the
 *  tidying up afterwards did not. */
export async function closeSession(token, sessionId, { fetchImpl = fetch } = {}) {
  try {
    await fetchImpl(`${PICKER}/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: auth(token),
    })
    return true
  } catch {
    return false
  }
}

/** Video, one day (#13), but not silently and not today. */
export const isPhoto = (item) => (item?.type ?? 'PHOTO') === 'PHOTO'

/**
 * A picked item, as the import route wants it.
 *
 * Tolerant on purpose. This is somebody else's response shape, it has been
 * renamed once already in this API's short life, and an import that drops a
 * thousand photographs because a field moved is a much worse failure than one
 * that carries a null through. Everything here is a hint; the authority for
 * when and where is the EXIF the server reads off the original bytes.
 */
export function asImport(item = {}) {
  const file = item.mediaFile ?? item.mediaFileMetadata ?? {}
  const meta = file.mediaFileMetadata ?? item.mediaMetadata ?? {}
  const at = item.createTime ?? meta.creationTime ?? null
  return {
    googleId: item.id ?? null,
    // Expires in about an hour — for fetching now, never for storing.
    fetchFrom: file.baseUrl ?? item.baseUrl ?? null,
    // The permanent one, and the only thing here safe to keep.
    productUrl: item.productUrl ?? null,
    filename: file.filename ?? item.filename ?? null,
    mimeType: file.mimeType ?? item.mimeType ?? null,
    width: Number(meta.width) || null,
    height: Number(meta.height) || null,
    takenAtHint: at,
  }
}

/** What to ask Google for. `=d` is the original, EXIF and all; without it
 *  Google helpfully hands back a stripped render, which is precisely the
 *  metadata this whole route exists to keep. */
export const originalUrl = (fetchFrom) => (fetchFrom ? `${fetchFrom}=d` : null)

/** Worth sending to the server at all. */
export function worthImporting(items = []) {
  return items.filter(isPhoto).map(asImport).filter((i) => i.googleId && i.fetchFrom)
}
