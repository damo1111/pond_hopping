import { createHmac, timingSafeEqual } from 'node:crypto'

// The `state` that goes to Google and comes back.
//
// The OAuth round trip leaves our control entirely: the browser goes to
// Google, Google redirects to our callback, and the only thing that survives
// is whatever we put in `state`. It has to carry who this is for — because
// the callback arrives with no Authorization header, no cookie we can rely
// on across a cross-site redirect, and no session.
//
// Which makes it the one parameter an attacker would love to write. A
// callback that trusts an unsigned `state` will happily write a Google grant
// against any user id somebody types into a URL — that is somebody else's
// photographs, handed over by us. So it is signed, and it expires.
//
// Its own file, and no imports beyond node:crypto, so the signing can be
// tested without a server.

/** Long enough to read a consent screen carefully, short enough that a URL
 *  left in a history or a chat log is worthless by the time anybody finds
 *  it. Ten minutes is what the rest of this app already uses for "you were
 *  in the middle of something". */
export const STATE_GOOD_FOR = 10 * 60 * 1000

const b64 = (buf) => Buffer.from(buf).toString('base64url')

const mark = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url')

/** Who this consent is for, sealed so it cannot be edited on the way. */
export function sealed(payload, secret, now = Date.now) {
  if (!secret) throw new Error('no secret')
  const body = b64(JSON.stringify({ ...payload, exp: now() + STATE_GOOD_FOR }))
  return `${body}.${mark(body, secret)}`
}

/**
 * What came back, or null.
 *
 * Null for every kind of wrong — edited, unsigned, signed with the wrong
 * key, expired, or gibberish — because the caller's only correct response to
 * any of them is identical: refuse, and do not write anything. Telling them
 * apart would only help somebody probing.
 */
export function opened(state, secret, now = Date.now) {
  if (!secret || typeof state !== 'string') return null
  const cut = state.lastIndexOf('.')
  if (cut <= 0) return null
  const body = state.slice(0, cut)
  const given = state.slice(cut + 1)
  const want = mark(body, secret)
  // Constant time, so the comparison cannot be used to guess the signature a
  // byte at a time. Lengths must match first — timingSafeEqual throws
  // otherwise, and a throw is itself a signal.
  if (given.length !== want.length) return null
  if (!timingSafeEqual(Buffer.from(given), Buffer.from(want))) return null
  let said
  try {
    said = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!said?.uid || !Number.isFinite(said.exp) || said.exp < now()) return null
  return said
}
