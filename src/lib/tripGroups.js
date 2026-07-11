// Collapses trips sharing the same `chapter` (e.g. "2024 Gap Year") into a
// single group, in place, at the position of the first trip that carries
// it — so a long, frequent-traveller history doesn't turn the Home
// carousel or the trip picker into an endless flat scroll. Trips with no
// chapter render individually, exactly as before.
export function groupTrips(tripMeta) {
  const items = []
  const seenChapters = new Set()
  for (const t of tripMeta) {
    if (!t.chapter) {
      items.push({ type: 'trip', trip: t })
      continue
    }
    if (seenChapters.has(t.chapter)) continue
    seenChapters.add(t.chapter)
    items.push({ type: 'chapter', chapter: t.chapter, trips: tripMeta.filter((x) => x.chapter === t.chapter) })
  }
  return items
}

export function chapterRange(trips) {
  const starts = trips.map((t) => t.start_date).filter(Boolean).sort()
  const ends = trips.map((t) => t.end_date).filter(Boolean).sort()
  if (!starts.length) return ''
  const opt = { month: 'short', year: 'numeric' }
  const a = new Date(starts[0]).toLocaleDateString('en-GB', opt)
  const b = ends.length ? new Date(ends[ends.length - 1]).toLocaleDateString('en-GB', opt) : null
  return b && b !== a ? `${a} – ${b}` : a
}

// De-duped country flags across a chapter's trips, in first-seen order —
// capped so a 7-trip era doesn't turn into a wall of flag badges.
// Capped at 2 — .country-flags is a fixed-width badge stack sized for the
// common 2-flag case (see globals.css); more would just clip/overlap.
export function chapterCountries(trips, cap = 2) {
  const seen = []
  for (const t of trips) {
    for (const c of t.countries || []) {
      if (!seen.includes(c)) seen.push(c)
    }
  }
  return seen.slice(0, cap)
}
