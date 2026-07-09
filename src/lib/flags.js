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
