// Country flags are stored as emoji in the DB (e.g. '🇭🇰'), which is fine
// for data entry but renders inconsistently across devices/fonts — some
// Android builds show a plain box or the wrong glyph, especially for
// constituent-country flags like Scotland that have no standard
// regional-indicator emoji at all. This decodes a flag emoji back to its
// ISO code so it can be rendered as a real flag-icons SVG instead.
//
// Standard country flags are built from two Unicode "regional indicator"
// characters (U+1F1E6-U+1F1FF, one per A-Z) — e.g. HK = regional
// indicator H + regional indicator K — so any such flag decodes to its
// ISO 3166-1 alpha-2 code by construction, no lookup table needed.
const REGIONAL_INDICATOR_BASE = 0x1f1e6

// A handful of flags used in this app have no standard emoji at all
// (constituent countries) and need an explicit stand-in.
const SPECIAL = {
  '🏴': 'gb-sct', // Scotland — used as a plain black flag placeholder
}

export function emojiFlagToIso(flag) {
  if (!flag) return null
  if (SPECIAL[flag]) return SPECIAL[flag]
  const points = Array.from(flag).map((c) => c.codePointAt(0))
  if (points.length !== 2) return null
  const letters = points.map((cp) => {
    const n = cp - REGIONAL_INDICATOR_BASE
    return n >= 0 && n < 26 ? String.fromCharCode(65 + n) : null
  })
  if (letters.some((l) => !l)) return null
  return letters.join('').toLowerCase()
}

/**
 * The other direction: 'gb' → '🇬🇧'.
 *
 * Needed because CountryFlags takes the emoji form — that is what trips store
 * — while everything that starts from a country code rather than from a trip
 * (the home-country picker, most obviously) holds the ISO code. Rather than
 * teach CountryFlags a second input, codes are converted on the way in.
 *
 * The emoji produced is never rendered as an emoji: CountryFlags immediately
 * decodes it back and draws the self-hosted SVG. It is a handle, not a glyph,
 * which is why 'gb-sct' round-trips to the same placeholder it came from.
 */
export function isoToEmojiFlag(iso) {
  const code = String(iso || '').toLowerCase()
  for (const [emoji, special] of Object.entries(SPECIAL)) {
    if (code === special) return emoji
  }
  if (!/^[a-z]{2}$/.test(code)) return null
  return String.fromCodePoint(
    ...[...code].map((c) => REGIONAL_INDICATOR_BASE + (c.charCodeAt(0) - 97))
  )
}
