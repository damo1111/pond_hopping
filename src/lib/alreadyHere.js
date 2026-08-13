// Which of these photographs is the trip missing?
//
// Picking the same camera roll twice — after a stall, or because nobody was
// sure the first go worked — uploaded every one of them again. David, 12
// August: "we need smarts to not upload every single one of the 262 pics
// again or if we have to, dedupe so total user sees is 262."
//
// Two ways to recognise a photograph already in a trip, used in that order:
//
//   1. Its fingerprint. Exact, cheap, and certain — same file, same digest.
//      Only photographs uploaded since fingerprints existed have one.
//   2. Its timestamp, counted rather than matched. Everything already in the
//      trip pre-dates fingerprints, so without this the first retry after
//      the change still sends all 262.
//
// The second needs care, and the care is the whole reason this is a tested
// file rather than three lines in a component. EXIF timestamps are precise
// to the second, and a burst of five shots is five photographs in the same
// second. Matching on the timestamp alone would look at "three already in
// the trip at 14:02:11" and throw away all five of the ones being offered.
//
// So it is a capacity problem, not a matching problem: a second that already
// holds three photographs can absorb three of the ones being offered, and the
// fourth and fifth are new. That is right in both directions — five offered
// against three held sends two; three offered against five held sends none.

/**
 * @param picked   [{ googleId?, fingerprint?, takenAt? }] — what somebody chose
 * @param existing [{ google_id?, fingerprint?, taken_at? }] — what it holds
 * @returns { fresh, already } — the ones to send, and how many were skipped
 *
 * Anything undated, unfingerprinted and unidentified is always fresh. It
 * cannot be recognised, and the cost of asking twice is a duplicate
 * photograph, while the cost of guessing wrong is a photograph that is never
 * uploaded at all.
 *
 * ── Rule 0, and why it earns its place ────────────────────────────────
 *
 * Google's own id for a photograph, checked first because it is the only
 * rule that costs *nothing at all*. The other two need the file: a
 * fingerprint is a digest of the first quarter-megabyte, and a timestamp
 * comes off the EXIF inside it. On the picker route neither exists until the
 * bytes have been fetched from Google — so without this, recognising a
 * photograph already in the trip would mean downloading it to find out.
 *
 * The picker hands over ids and creation times before a single byte moves,
 * so between rule 0 and rule 2 almost every duplicate is refused before
 * anything is transferred. Which is the whole point: an import that skips
 * nine hundred photographs should cost nine hundred *lines of JSON*, not
 * nine hundred downloads.
 */
export function whatIsNew(picked = [], existing = []) {
  const seenPrints = new Set()
  const seenGoogle = new Set()
  for (const e of existing) {
    if (e?.fingerprint) seenPrints.add(e.fingerprint)
    if (e?.google_id) seenGoogle.add(e.google_id)
  }

  // How many photographs the trip holds at each exact instant, minus any
  // that a fingerprint has already accounted for — otherwise a photo caught
  // by rule 1 would also be counted by rule 2 and let a second one through.
  const room = new Map()
  for (const e of existing) {
    const at = e?.taken_at
    if (!at) continue
    room.set(at, (room.get(at) ?? 0) + 1)
  }

  const fresh = []
  let already = 0
  // Each rule that matches also spends the instant its row occupied, or a
  // photograph caught by an earlier rule would be counted again by a later
  // one and let a genuinely new photograph through in its place.
  const spend = (at) => {
    if (at && room.get(at) > 0) room.set(at, room.get(at) - 1)
  }
  for (const p of picked) {
    if (p?.googleId && seenGoogle.has(p.googleId)) {
      already += 1
      spend(p.takenAt)
      continue
    }
    if (p?.fingerprint && seenPrints.has(p.fingerprint)) {
      already += 1
      spend(p.takenAt)
      continue
    }
    const at = p?.takenAt
    if (at && room.get(at) > 0) {
      room.set(at, room.get(at) - 1)
      already += 1
      continue
    }
    fresh.push(p)
  }
  return { fresh, already }
}

/**
 * A digest of the first bytes plus the length.
 *
 * The head is already read for EXIF, so this is free where it is used. A
 * quarter of a megabyte of JPEG covers the metadata and a good deal of the
 * first scan, and the byte length pins the rest — two different photographs
 * agreeing on both is not a thing that happens.
 *
 * Returns null rather than throwing anywhere crypto.subtle is unavailable
 * (an insecure origin, chiefly). A photo with no fingerprint simply falls
 * through to the timestamp rule.
 */
export async function fingerprintOf(head, size) {
  try {
    const digest = await globalThis.crypto?.subtle?.digest('SHA-256', head)
    if (!digest) return null
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${size}-${hex.slice(0, 32)}`
  } catch {
    return null
  }
}
