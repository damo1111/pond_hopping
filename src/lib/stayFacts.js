// What a stay actually knows about itself, as short labelled facts.
//
// A hotel row used to print its raw `note` — the semicolon soup the
// extractor left behind: "Confirmation code: HM3BCPYMNX; Entire home/flat ·
// 4 beds · 4 guests; Receipt ID: RCDZSY9J9T · imported". Every fact was
// there and none of it was legible, on a booking whose email had run to a
// page and a half.
//
// Now that imports carry structured detail, the same information can be set
// out as facts. Order matters: the things you want on the walk from the car
// come first, and the reference numbers you only want at a desk come last.

// Zero counts as absent, not as a value: a stay of no nights for no guests
// is a parsing accident rather than something to print.
const yes = (v) => v !== null && v !== undefined && v !== '' && v !== false && v !== 0

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Hand-entered stays predate the imported shape and use their own keys, so
// both are read rather than migrating rows that are working perfectly well.
const FIELDS = [
  { keys: ['nights'], render: (v) => plural(v, 'night', 'nights') },
  { keys: ['guests', 'party_size'], render: (v) => plural(v, 'guest', 'guests') },
  { keys: ['room'], render: (v) => v },
  { keys: ['breakfast'], render: (v) => (v === true ? 'Breakfast included' : null) },
  { keys: ['host'], render: (v) => `Host: ${v}` },
  { keys: ['address'], render: (v) => v },
  { keys: ['total', 'total_gbp'], render: (v) => (typeof v === 'number' ? `£${v.toLocaleString()}` : v) },
  { keys: ['confirmation', 'booking_ref'], render: (v) => v },
]

/**
 * @param {object} detail a planned_events.detail
 * @returns {string[]} short strings, in reading order, ready to render
 */
export function stayFacts(detail = {}) {
  const out = []
  for (const f of FIELDS) {
    const key = f.keys.find((k) => yes(detail?.[k]))
    if (!key) continue
    const text = f.render(detail[key])
    if (yes(text)) out.push(String(text))
  }
  return out
}

/**
 * Whether the raw note is worth printing underneath.
 *
 * When the facts above cover it, the note is the same information again in
 * worse prose — the exact duplication that made these rows unreadable.
 */
export function noteWorthShowing(note, detail) {
  if (!note) return false
  return stayFacts(detail).length === 0
}
