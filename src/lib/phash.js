// Recognising the same photograph twice.
//
// David keeps stylised copies of his own pictures — the ones he put on
// Instagram — and wants them out of the log. The obvious way to find them
// is the EXIF timestamp, and it does not work: in the 299 Rome photographs
// there are five exact-timestamp collisions and all five are consecutive
// seconds, which is a burst rather than a copy. The copies that matter are
// the ten with no timestamp and no GPS at all, because exporting through a
// filter strips EXIF on the way out.
//
// So the only thing left to compare is the picture. A difference hash is
// the cheap, boring answer: shrink to nine by eight, take the grey value of
// each pixel, and record whether each one is brighter than the pixel to its
// right. Sixty-four comparisons, sixty-four bits.
//
// It survives exactly what a stylised copy does to a photograph — a filter,
// a re-save, a resize, a crop of the edges, a change of contrast — because
// none of those reorder which parts of a scene are lighter than which. It
// deliberately does not survive a mirror flip or a heavy crop, and it is
// not trying to: this is "is this the same photograph", not "is this the
// same place".

/** How far apart two hashes may be and still be the same photograph.
 *
 *  Twelve of sixty-four bits. Under about eight is the same file resaved;
 *  the teens are where genuinely different pictures of the same scene start
 *  turning up, and a travel log offering to delete one of those is much
 *  worse than one that misses a duplicate. */
export const SAME_PICTURE = 12

/** The grid the hash is taken on. Nine across so there are eight
 *  comparisons per row. */
export const W = 9
export const H = 8

/**
 * 64-bit difference hash of a W×H greyscale grid, as 16 hex characters.
 *
 * @param grey  W*H values, 0–255, row major
 */
export function dhash(grey) {
  if (!grey || grey.length < W * H) return null
  let bits = ''
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W - 1; x++)
      bits += grey[y * W + x] > grey[y * W + x + 1] ? '1' : '0'

  let hex = ''
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  return hex
}

/** Greyscale, the way eyes weight it rather than a flat average. */
export function greyscale(rgba) {
  const out = new Uint8Array(rgba.length / 4)
  for (let i = 0; i < out.length; i++)
    out[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000
  return out
}

const NIBBLE_BITS = Array.from({ length: 16 }, (_, n) => ((n >> 3) & 1) + ((n >> 2) & 1) + ((n >> 1) & 1) + (n & 1))

/** How many of the sixty-four comparisons disagree. */
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity
  let d = 0
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    if (Number.isNaN(x)) return Infinity
    d += NIBBLE_BITS[x]
  }
  return d
}

/**
 * Photographs that are the same photograph, in groups.
 *
 * Every member of a group is within `within` of the one that started it,
 * rather than of each other — the transitive version drifts, and a chain of
 * near-misses ends up proposing that a sunset and a doorway are the same
 * picture.
 *
 * @returns groups of two or more, largest first
 */
/** How far apart a burst may be, given that it was a burst.
 *
 *  Perceptual distance alone cannot separate "the same photograph twice"
 *  from "two photographs of the same fountain": both land in the teens. On a
 *  real trip of a hundred and three pictures, nothing at all was within
 *  twelve, and of the pairs between thirteen and eighteen, eleven were taken
 *  within ninety seconds of each other — one pair in the same instant — and
 *  eleven were hours apart.
 *
 *  So the second number is time. Two pictures this alike, taken a minute
 *  apart, are somebody holding the shutter down. The same two taken on
 *  different afternoons are two visits to the same place, and offering to
 *  delete one of those is the failure worth avoiding. */
export const SAME_BURST = 18
export const BURST_SECONDS = 90

const when = (p) => (p?.taken_at ? Date.parse(p.taken_at) : NaN)

/** Are these two the same photograph, by distance or by distance and time? */
export function sameShot(a, b, { within = SAME_PICTURE, burst = SAME_BURST, seconds = BURST_SECONDS } = {}) {
  const apart = hamming(a.phash, b.phash)
  if (apart <= within) return true
  if (apart > burst) return false
  const ta = when(a)
  const tb = when(b)
  // No time on either is no evidence of a burst, so the tighter test stands.
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false
  return Math.abs(ta - tb) <= seconds * 1000
}

export function groupSame(photos = [], opts = {}) {
  const how = typeof opts === 'number' ? { within: opts } : opts
  const usable = photos.filter((p) => typeof p?.phash === 'string' && p.phash.length === 16)
  const taken = new Set()
  const groups = []

  for (const seed of usable) {
    if (taken.has(seed.id)) continue
    const group = [seed]
    taken.add(seed.id)
    for (const other of usable) {
      if (taken.has(other.id)) continue
      if (sameShot(seed, other, how)) {
        group.push(other)
        taken.add(other.id)
      }
    }
    if (group.length > 1) groups.push(group)
  }

  return groups.sort((a, b) => b.length - a.length)
}

/**
 * Which of a group to keep.
 *
 * The one that still knows when and where it was taken. A stylised export
 * has been through something that threw its EXIF away, so the copy that
 * kept its date and its coordinates is both the original and the one worth
 * more to a travel log — it can put itself on a map; the other cannot.
 *
 * Ties go to whichever arrived first, which is stable and arbitrary in that
 * order rather than the other way round.
 */
export function pickKeeper(group = []) {
  return [...group].sort((a, b) => score(b) - score(a) || String(a.created_at).localeCompare(String(b.created_at)))[0]
}

function score(p) {
  return (
    (p?.lat != null && p?.lon != null ? 4 : 0) +
    (p?.taken_at ? 2 : 0) +
    (p?.is_highlight ? 8 : 0) +
    (p?.caption ? 1 : 0)
  )
}
