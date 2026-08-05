// The numbers a trip earns the right to boast about.
//
// A recap is only worth opening if what it says is true and specific — "6
// flights, 17,204 km, 4 cities" is a memory; "you had a great trip" is a
// screensaver. So every figure here is derived from rows that actually
// exist, and anything with nothing behind it is simply not shown rather
// than being rendered as a proud zero.

const round = (n) => Math.round(n)

// Cities come from three places that disagree with each other: journal
// entries name where you slept, flights name where you landed, and neither
// is complete on its own. Deduped case-insensitively, first spelling wins.
function collectCities({ entries = [], flights = [] }) {
  const seen = new Map()
  const add = (name) => {
    const key = String(name || '').trim().toLowerCase()
    if (!key) return
    if (!seen.has(key)) seen.set(key, String(name).trim())
  }
  for (const e of entries) add(e.city)
  for (const f of flights) {
    add(f.arr_city)
    add(f.dep_city)
  }
  return [...seen.values()]
}

export function recapStats({ trip = {}, flights = [], entries = [], runs = [], photos = [] }) {
  const km = flights.reduce((sum, f) => sum + (Number(f.distance_km) || 0), 0)
  const runKm = runs.reduce((sum, r) => sum + (Number(r.distance_km) || 0), 0)
  const cities = collectCities({ entries, flights })

  // Inclusive of both ends — a trip that leaves on the 1st and returns on
  // the 3rd was three days away, not two.
  let days = null
  if (trip.start_date && trip.end_date) {
    const a = new Date(`${String(trip.start_date).slice(0, 10)}T00:00:00Z`)
    const b = new Date(`${String(trip.end_date).slice(0, 10)}T00:00:00Z`)
    days = Math.round((b - a) / 86400000) + 1
    if (days < 1) days = null
  }

  const airports = new Set()
  for (const f of flights) {
    if (f.dep_airport) airports.add(f.dep_airport)
    if (f.arr_airport) airports.add(f.arr_airport)
  }

  // `to` is the screen that figure is counting. A number derived from rows
  // you can go and look at should take you there — which is also why the
  // recap doesn't need a row of signpost tiles bolted underneath it. The
  // ones with no `to` (days away, km flown, airports) have nowhere honest
  // to point, so they stay as plain text rather than pretending.
  const figures = [
    days && { key: 'days', value: String(days), label: days === 1 ? 'day away' : 'days away' },
    flights.length && {
      key: 'flights',
      value: String(flights.length),
      label: flights.length === 1 ? 'flight' : 'flights',
      to: 'flights',
    },
    km >= 1 && { key: 'km', value: round(km).toLocaleString('en-GB'), label: 'km flown' },
    cities.length && {
      key: 'cities',
      value: String(cities.length),
      label: cities.length === 1 ? 'city' : 'cities',
      to: 'map',
    },
    airports.size && { key: 'airports', value: String(airports.size), label: 'airports' },
    runKm >= 1 && { key: 'runs', value: round(runKm).toLocaleString('en-GB'), label: 'km run', to: 'map' },
    entries.length && {
      key: 'entries',
      value: String(entries.length),
      label: entries.length === 1 ? 'day written up' : 'days written up',
      to: 'journal',
    },
    photos.length && { key: 'photos', value: String(photos.length), label: 'photos', to: 'photos' },
  ].filter(Boolean)

  return { figures, cities, km: round(km), runKm: round(runKm), days }
}

// Enough to fill a recap without it feeling like a stub. Below this the
// screen is mostly empty space and a headline, which is worse than not
// offering it.
export function worthRecapping(stats) {
  return stats.figures.length >= 3
}
