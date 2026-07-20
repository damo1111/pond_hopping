import { emojiFlagToIso } from './flags.js'

// ISO code -> a name Wikipedia's summary API will actually resolve.
// Covers the codes already in public/flags/ (see CountryFlags.jsx).
const COUNTRY_NAMES = {
  au: 'Australia',
  cn: 'China',
  de: 'Germany',
  gb: 'United Kingdom',
  'gb-sct': 'Scotland',
  hk: 'Hong Kong',
  it: 'Italy',
  jp: 'Japan',
  kr: 'South Korea',
  lk: 'Sri Lanka',
  my: 'Malaysia',
  nl: 'Netherlands',
  nz: 'New Zealand',
  sg: 'Singapore',
  th: 'Thailand',
  us: 'United States',
}

// A trip's `countries` column has held two shapes over this app's life —
// plain lowercase ISO codes ('gb') and flag emoji ('🇬🇧') — so accept
// either. Falls back to the trip title itself if nothing resolves,
// which still works fine for a title that's already a real place name.
export function destinationQuery(trip) {
  const codes = (trip.countries || [])
    .map((c) => (/^[a-z]{2}(-[a-z]+)?$/.test(c) ? c : emojiFlagToIso(c)))
    .filter(Boolean)
  const name = codes.map((c) => COUNTRY_NAMES[c]).find(Boolean)
  return name || trip.title
}

// One source of truth for the itinerary item vocabulary — icon + colour
// per kind, matching the app's established "colour-code by category"
// pattern (CostsTab CAT_ICON, tripColors palette) rather than tinting
// everything the CANARD gold, which reads wrong in the planner.
export const KIND_META = {
  flight: { icon: '✈️', color: '#3B7EA1', label: 'Flight' },
  hotel: { icon: '🏨', color: '#C97B95', label: 'Stay' },
  transport: { icon: '🚆', color: '#3E7D54', label: 'Travel' },
  car_hire: { icon: '🚗', color: '#B5602E', label: 'Car hire' },
  activity: { icon: '🎟️', color: '#C17817', label: 'Activity' },
  place: { icon: '📍', color: '#6E7B8C', label: 'Place' },
  other: { icon: '📌', color: '#8B8375', label: 'Other' },
}

// The kinds the "add" menu offers, in the order the reference app shows them.
export const ADD_KINDS = ['flight', 'hotel', 'transport', 'car_hire', 'place', 'activity']

// A plain YYYY-MM-DD string for a Date, in local terms (no TZ shift).
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Every day of the trip, inclusive, as { key, date, label, weekday, dayNum }.
// Scoped strictly to the declared start/end dates — the day switcher and
// calendar never show anything outside them.
export function tripDays(start, end) {
  if (!start) return []
  const s = new Date(start + 'T00:00:00')
  const e = new Date((end || start) + 'T00:00:00')
  const out = []
  const cur = new Date(s)
  let guard = 0
  while (cur <= e && guard++ < 400) {
    out.push({
      key: ymd(cur),
      date: new Date(cur),
      weekday: cur.toLocaleDateString('en-GB', { weekday: 'short' }),
      label: cur.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      dayNum: out.length + 1,
    })
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

// Order events within a day: timed items first (by start_time), then a
// manual sort_order, then title.
export function sortEvents(events) {
  return [...events].sort((a, b) => {
    const ad = (a.event_date || '9999') + (a.start_time || '99:99')
    const bd = (b.event_date || '9999') + (b.start_time || '99:99')
    if (ad !== bd) return ad < bd ? -1 : 1
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0)
    return (a.title || '').localeCompare(b.title || '')
  })
}

export function fmtTime(t) {
  if (!t) return ''
  // Accept 'HH:MM' or 'HH:MM:SS'
  const [h, m] = t.split(':')
  const hr = Number(h)
  const suffix = hr >= 12 ? 'PM' : 'AM'
  const h12 = hr % 12 === 0 ? 12 : hr % 12
  return `${h12}:${m}${suffix}`
}

export function fmtDayLong(iso) {
  if (!iso) return 'No date yet'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}
