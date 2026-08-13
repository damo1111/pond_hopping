// One accent per trip so overlapping routes/sections read as distinct
// journeys instead of one dense gold tangle. Shared by the globe, and by
// every other tab that wants to echo the selected trip's colour.
export const TRIP_COLORS = {
  'south-korea': '#D4AF37',
  'new-zealand': '#5FA876',
  'china-japan': '#D9614F',
  'singapore-malaysia': '#4FA8C9',
  bangkok: '#E0954C',
  'sri-lanka-voyage': '#9B7FD4',
  'new-orleans': '#8B3A42',
  'germany-ny-tier-run': '#4C7FB0',
  'rome-2024': '#B5602E',
  'harpenden-amsterdam-2024': '#8A9550',
  'usa-big-trip-2024': '#A85FA8',
  'amsterdam-mother-2024': '#C97B95',
  'ny-collect-bob-2024': '#6E7B8C',
  'asia-pacific-2024': '#3E9E96',
}

/** The example copy of a trip is the same journey, so it is the same colour.
 *  `china-japan-example` missed the map entirely and fell back to plain gold
 *  — which was invisible while the example had a photograph on it, and the
 *  moment an example without a cover took over, its drawn card was drawn in
 *  the wrong hand. Stripping the suffix rather than adding rows, so it holds
 *  for whichever trip is the example next. */
export function tripColor(slug) {
  const key = String(slug ?? '')
  return TRIP_COLORS[key] || TRIP_COLORS[key.replace(/-example$/, '')] || '#A8842C'
}
