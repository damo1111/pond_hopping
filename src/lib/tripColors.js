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

export function tripColor(slug) {
  return TRIP_COLORS[slug] || '#A8842C'
}
