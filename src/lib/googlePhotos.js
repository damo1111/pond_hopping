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
/**
 * A still photograph, and not a film.
 *
 * Two tests rather than one, because the first has a hole. `type` is absent
 * on some responses and the default has to be PHOTO — an import that drops
 * everything because a field moved is far worse than one that lets an odd
 * item through. But that default is exactly what a video with no `type`
 * lands on, and a video sent to the importer is a download, a sharp decode
 * that throws, and a row marked failed for a file that was never wanted.
 *
 * So the mime type gets a say too, and it is the more reliable of the two:
 * `video/quicktime`, `video/mp4`. Either one saying film is enough.
 *
 * Video is a real feature, not a bug — see backlog. Until it exists, the
 * honest thing is to leave them where they are and say so, rather than
 * fetching them to fail.
 */
export const isPhoto = (item) => {
  if ((item?.type ?? 'PHOTO') !== 'PHOTO') return false
  const mime = item?.mediaFile?.mimeType ?? item?.mimeType ?? ''
  if (String(mime).toLowerCase().startsWith('video/')) return false
  // The metadata carries a `video` block only for films, whatever `type` says.
  const meta = item?.mediaFile?.mediaFileMetadata ?? item?.mediaMetadata ?? {}
  return !meta?.video
}

/** How many films were left where they are, so it can be said out loud
 *  rather than silently dropped from the count. */
export const filmsAmong = (items = []) => items.filter((i) => !isPhoto(i)).length

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

/**
 * Picks, as clusterPhotos wants to read them.
 *
 * One renamed field, and it is the field that makes "Start from photos"
 * possible from Google at all: the creation time arrives with the pick,
 * before a single byte is fetched, so the dates that decide what the trip is
 * are already in hand. clusterPhotos reads `takenAt`; the picker calls it
 * `creationTime`, and asImport carries it as `takenAtHint` precisely because
 * it is not the authority.
 *
 * Still a hint on the way through. The authority for when a photograph was
 * taken is the EXIF the server reads off the original bytes, and the two can
 * disagree — a scan of a print is created today and taken in 1994. It is
 * good enough to split a camera roll into trips, which is all this is asked
 * to do.
 */
export const asDated = (picked = []) =>
  picked.map((p) => ({ ...p, takenAt: p.takenAtHint ?? null }))

/**
 * What the sweep should do with one recorded session.
 *
 * The sweep runs with nobody watching, once a minute, over sessions that may
 * have been finished, abandoned, or never opened. Three answers and no
 * others, so the loop that calls this cannot invent a fourth by accident:
 *
 *   'collect' — Google says the pick is set. Go and read it.
 *   'gone'    — Google no longer knows this session. Stop asking, say why.
 *   'wait'    — nobody has finished choosing yet, or Google had a bad
 *               moment. Both are answered by trying again in a minute.
 *
 * The distinction that matters is the middle one against the last. A session
 * Google has forgotten will never become ready, and retrying it once a
 * minute forever is how a queue fills with rows nobody will ever look at. A
 * 500 from Google is not that, and treating it as that would throw away a
 * pick somebody made — which is the exact loss this whole route exists to
 * stop happening a second time.
 */
export function whatToDoWith(said, status = 200) {
  if (status === 404 || status === 403 || status === 401) return 'gone'
  if (!said || typeof said !== 'object') return 'wait'
  return said.mediaItemsSet ? 'collect' : 'wait'
}
