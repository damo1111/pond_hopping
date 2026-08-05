// "Nowhere on the someday-list yet" is a dead end on a screen that is already
// mostly white space. A wishlist with nothing in it should be selling
// something — and the most persuasive thing this app can say is drawn from
// the reader's own flight history: you have landed in eleven countries and
// none of them were in South America.
//
// Coarse boxes rather than a real geocoder: naming a region you have never
// flown to only needs to be right at continental scale, and a lookup table is
// a hundred bytes against a dependency and a network call.

const REGIONS = [
  { id: 'south-america', name: 'South America', box: [-56, -82, 13, -34], prompt: 'Patagonia, Rio, the Atacama' },
  { id: 'africa', name: 'Africa', box: [-35, -18, 37, 52], prompt: 'Cape Town, Marrakech, the Serengeti' },
  { id: 'central-asia', name: 'Central Asia', box: [35, 46, 55, 88], prompt: 'Samarkand, the Pamir Highway' },
  { id: 'north-america', name: 'North America', box: [15, -168, 72, -52], prompt: 'the Rockies, New Orleans, Big Sur' },
  { id: 'europe', name: 'Europe', box: [35, -11, 71, 40], prompt: 'Lisbon, the Dolomites, the fjords' },
  { id: 'south-asia', name: 'South Asia', box: [5, 68, 35, 92], prompt: 'Kerala, Sri Lanka, the Himalaya' },
  { id: 'east-asia', name: 'East Asia', box: [20, 100, 54, 146], prompt: 'Kyoto, Seoul, Taipei' },
  { id: 'south-east-asia', name: 'South-East Asia', box: [-11, 92, 23, 141], prompt: 'Luang Prabang, Bali, Hanoi' },
  { id: 'oceania', name: 'the Pacific', box: [-30, 155, 20, 200], prompt: 'Samoa, Fiji, the Cooks' },
  { id: 'middle-east', name: 'the Middle East', box: [12, 34, 42, 63], prompt: 'Petra, Muscat, Istanbul' },
]

// Longitudes east of the date line are written either way round depending on
// who wrote the row; normalising means the Pacific box catches both.
const norm = (lon) => (lon < -150 ? lon + 360 : lon)

function inBox(lat, lon, [s, w, n, e]) {
  return lat >= s && lat <= n && norm(lon) >= w && norm(lon) <= e
}

/** Every region this account has actually landed in. */
export function regionsVisited(flights = []) {
  const seen = new Set()
  for (const f of flights) {
    for (const [lat, lon] of [[f.arr_lat, f.arr_lon], [f.dep_lat, f.dep_lon]]) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      for (const r of REGIONS) if (inBox(lat, lon, r.box)) seen.add(r.id)
    }
  }
  return seen
}

/**
 * A region to suggest, or null. Deterministic given the same history — this
 * sits in an empty state, and an empty state that says something different on
 * every render reads as noise rather than as a suggestion.
 *
 * Someone who has genuinely been everywhere gets nothing rather than a lie.
 */
export function neverBeen(flights = []) {
  const seen = regionsVisited(flights)
  const unseen = REGIONS.filter((r) => !seen.has(r.id))
  if (!unseen.length) return null
  // Stable pick: the first unvisited region in the list, which is ordered
  // roughly by how far it is from an Australian starting point.
  const pick = unseen[0]
  return { id: pick.id, name: pick.name, prompt: pick.prompt, visited: seen.size, total: REGIONS.length }
}
