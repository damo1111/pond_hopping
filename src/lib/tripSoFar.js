// "Three days in." — what a trip has amounted to, while it is still happening.
//
// The mid-trip screen shows which day of how many, and then the days
// themselves. Between those two there was nothing: no line saying what the
// trip has been so far, which is the thing somebody actually wants at the top
// of a screen they open on a train.
//
// ── Why this is arithmetic and not a paragraph ────────────────────────────
//
// The mock had a written sentence — "Three days in: Bangkok, then the train
// north. 14 photos a day, one temple too many, and nowhere booked past
// Friday." That is a lovely line and it is the story engine's job, not this
// one's: it needs the days to have been written first, and Thailand's have
// not been.
//
// So this composes from counts, which exist the moment a trip does. It says
// less and it is never wrong, and when the day entries arrive the written
// version can sit beneath it rather than replace it.
//
// The rule throughout: say nothing rather than say something empty. A clause
// with a zero in it — "0 photos", "no cities" — is worse than a shorter
// sentence, because it reads as the app reporting a failure rather than as a
// trip that has only just started.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * How far in, in words.
 *
 * Not "day 3 of 10" — the caption above already says that, and repeating it
 * in prose is how a screen starts sounding like a form. This is the softer
 * framing that a sentence wants to start with.
 */
export function daysIn(day) {
  if (!day || day < 1) return null
  if (day === 1) return 'First day'
  const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
  const said = WORDS[day] ?? String(day)
  return `${said} day${day === 1 ? '' : 's'} in`
}

/**
 * One line about the trip so far, or null.
 *
 * @param day        which day of the trip it is (from tripProgress)
 * @param photos     how many photographs are on it
 * @param flights    how many legs it has
 * @param countries  how many countries it touches
 * @param unbooked   nights ahead with nowhere to sleep, if that is known
 *
 * The three counts are exactly the ones trip_meta already carries, rather
 * than a shape this file would prefer. An earlier draft asked for "places",
 * which nothing counts — and inventing a number to fill a sentence is how a
 * summary ends up lying about a trip.
 *
 * Deliberately returns null rather than a shrug. A trip on its first morning
 * with nothing in it yet has nothing to summarise, and "First day. 0 photos"
 * is a worse thing to read than a blank space — it makes the app sound
 * disappointed in you.
 */
export function tripSoFar({ day = 0, photos = 0, flights = 0, countries = 0, unbooked = null } = {}) {
  const opener = daysIn(day)
  if (!opener) return null

  const bits = []
  if (photos > 0) bits.push(plural(photos, 'photo'))
  if (flights > 0) bits.push(plural(flights, 'flight'))
  // Only when there is more than one. "1 country" is not a fact about a trip,
  // it is a fact about every trip, and Thailand saying "1 country" reads as
  // the app counting for the sake of counting.
  if (countries > 1) bits.push(plural(countries, 'country', 'countries'))
  // Only ever mentioned when it is a real problem. "0 nights with nowhere to
  // sleep" is not reassurance, it is noise — and the whole clause is the kind
  // of thing that is only worth saying when the answer is bad.
  if (unbooked > 0) bits.push(`${plural(unbooked, 'night')} with nowhere to sleep`)

  if (!bits.length) return `${opener}.`
  return `${opener}. ${sentence(bits)}.`
}

/**
 * "a, b and c" — an Oxford-comma-free list, because this is a sentence a
 * person reads rather than a field a machine fills.
 */
function sentence(bits) {
  if (bits.length === 1) return bits[0]
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`
}
