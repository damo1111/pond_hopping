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
}

export function tripColor(slug) {
  return TRIP_COLORS[slug] || '#A8842C'
}
