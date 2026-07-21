// The Concierge's brain: figure out, night by night, where David is
// actually sleeping — and where nothing is booked yet. Every night of the
// trip is classified as one of:
//   stay     — a hotel-kind event covers it (event_date <= night < end_date)
//   transit  — an overnight flight covers it (departs that day and lands
//              the next), or a red-eye departing before ~6am the next
//              morning (the "night" is spent at the airport/in the air —
//              e.g. CMB→MEL departing 00:20 covers the evening before)
//   gap      — nothing booked. This is what needs attention.
// Consecutive gap nights merge into one gap, and each gap gathers its
// evidence: the activities happening on those days, whose cities tell us
// where the hotel should actually be.

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return ymd(d)
}

function nightCovered(events, night) {
  const nextDay = addDays(night, 1)
  for (const ev of events) {
    if (ev.kind === 'hotel' && ev.event_date && ev.event_date <= night && (ev.end_date || ev.event_date) > night) {
      return { type: 'stay', ev }
    }
    if (ev.kind === 'flight') {
      // Overnight flight: departs on `night`, lands after it.
      if (ev.event_date === night && ev.end_date && ev.end_date > night) return { type: 'transit', ev }
      // Red-eye departing in the small hours of the following morning.
      if (ev.event_date === nextDay && ev.start_time && ev.start_time < '06:00') return { type: 'transit', ev }
    }
  }
  return null
}

export function computeCoverage(trip, events) {
  if (!trip.start_date || !trip.end_date) return null
  const nights = []
  for (let d = trip.start_date; d < trip.end_date; d = addDays(d, 1)) {
    nights.push({ date: d, cover: nightCovered(events, d) })
  }

  const gaps = []
  let current = null
  for (const n of nights) {
    if (!n.cover) {
      if (!current) current = { start: n.date, nights: 0 }
      current.nights += 1
      current.end = addDays(n.date, 1) // checkout-style end
    } else if (current) {
      gaps.push(current)
      current = null
    }
  }
  if (current) gaps.push(current)

  // Evidence per gap: what's happening on those days tells the Concierge
  // where the missing hotel should be.
  for (const gap of gaps) {
    const evidence = events
      .filter((e) => e.kind !== 'flight' && e.kind !== 'hotel' && e.event_date && e.event_date >= gap.start && e.event_date <= gap.end)
      .sort((a, b) => (a.event_date < b.event_date ? -1 : 1))
    gap.evidence = evidence
    const counts = {}
    for (const e of evidence) if (e.city) counts[e.city] = (counts[e.city] || 0) + 1
    gap.cities = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([city]) => city)
  }

  return {
    totalNights: nights.length,
    stayNights: nights.filter((n) => n.cover?.type === 'stay').length,
    transitNights: nights.filter((n) => n.cover?.type === 'transit').length,
    gapNights: gaps.reduce((a, g) => a + g.nights, 0),
    gaps,
    nights,
  }
}

export function fmtGapRange(gap) {
  const f = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${f(gap.start)} → ${f(gap.end)}`
}
