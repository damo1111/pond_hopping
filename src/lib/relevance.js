// Which countries you are actually going to, soonest first.
//
// Currency listed thirteen currencies in a fixed order and Phrases listed
// eight languages in another, neither of which had any idea where anybody
// was going. Phrases half-tried, with a table keyed on trip slug — which
// worked for the six trips that existed when it was written and knows
// nothing about Rome, the examples, or any trip made since.
//
// The trips already carry their countries, as flag emoji. A flag is two
// regional indicator symbols, and those are just letters with an offset —
// so 🇭🇰 becomes "HK" by arithmetic, for every country, with no table to
// maintain and nothing to forget to add.
//
// Sorted, never filtered. Somebody looking up the yen the week before they
// have booked anything is a person this app exists for, and hiding it until
// they have made a trip would be the wrong way round.

const A = 0x1f1e6 // 🇦

/** '🇭🇰' → 'HK'. Null for anything that is not a flag. */
export function flagToCode(flag) {
  const points = [...String(flag ?? '')].map((c) => c.codePointAt(0))
  if (points.length !== 2) return null
  if (points.some((c) => c < A || c > A + 25)) return null
  return points.map((c) => String.fromCharCode(65 + (c - A))).join('')
}

const iso = (d) => new Date(d).toISOString().slice(0, 10)

/**
 * Country codes in the order they matter today.
 *
 * On a trip now, then the next one coming, then the most recent one been
 * on. Ordering by what is imminent rather than by what is frequent, because
 * the reason to open Currency is usually the thing about to happen.
 */
export function relevantCodes(trips = [], today = iso(Date.now())) {
  const seen = new Map()

  for (const trip of trips ?? []) {
    const start = trip?.start_date
    if (!start) continue
    const end = trip.end_date || start

    // 0 on it, 1 ahead, 2 behind. Then by how close: the soonest future
    // trip and the most recent past one both sort to the front of theirs.
    let bucket
    let distance
    if (start <= today && today <= end) {
      bucket = 0
      distance = 0
    } else if (start > today) {
      bucket = 1
      distance = days(start, today)
    } else {
      bucket = 2
      distance = days(today, end)
    }

    for (const flag of trip.countries ?? []) {
      const code = flagToCode(flag)
      if (!code) continue
      const rank = [bucket, distance]
      const held = seen.get(code)
      // A country on two trips takes the better of the two, so somewhere
      // you are going next month is not buried by having been there once.
      if (!held || rank[0] < held[0] || (rank[0] === held[0] && rank[1] < held[1])) {
        seen.set(code, rank)
      }
    }
  }

  return [...seen.entries()]
    .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1] || a[0].localeCompare(b[0]))
    .map(([code]) => code)
}

function days(a, b) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000
}

/**
 * Put the relevant ones first and leave everything else alone.
 *
 * Stable, so the original order survives underneath — the list somebody
 * learned last week is still the list, with the useful end brought forward.
 *
 * @param items  whatever is being listed
 * @param codeOf item → its country code
 * @param order  from relevantCodes()
 */
export function sortByRelevance(items = [], codeOf = (x) => x, order = []) {
  const rank = new Map(order.map((code, i) => [code, i]))
  return [...items]
    .map((item, i) => ({ item, i, at: rank.has(codeOf(item)) ? rank.get(codeOf(item)) : Infinity }))
    .sort((a, b) => a.at - b.at || a.i - b.i)
    .map((x) => x.item)
}
