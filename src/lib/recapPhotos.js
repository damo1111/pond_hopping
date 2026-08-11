// Which twelve photographs the recap shows, when somebody has starred more.
//
// The recap has room for twelve. Starring is how you say which pictures are
// the good ones, and there was no reason to stop at twelve — so somebody who
// stars thirty gets twelve of them and never sees the other eighteen, on any
// visit, ever. The stars past the twelfth did nothing at all.
//
// So it rotates. Each opening advances a window through the starred ones,
// which means the page is a little different every time you come back to it
// and every picture you chose eventually gets shown.
//
// Two things it deliberately is not:
//
//   not random — a window that reshuffles on every render changes under you
//     while you are looking at it, and two people opening the same shared
//     link on the same day should see the same page
//   not a reset — the window carries on from where it was rather than
//     starting again, so coming back twice does not show the same twelve

/** Room on the page. */
export const SHOWN = 12

/**
 * A window of `SHOWN`, advanced by `turn`, wrapping around the end.
 *
 * Chronological within the window, because a set of photographs from one
 * trip reads as a day going past rather than as a grid of unrelated frames.
 */
function windowOf(list, turn) {
  if (list.length <= SHOWN) return list
  const from = ((turn % list.length) + list.length) % list.length
  const out = []
  for (let i = 0; i < SHOWN; i++) out.push(list[(from + i) % list.length])
  return out.sort((a, b) => String(a.taken_on ?? '').localeCompare(String(b.taken_on ?? '')))
}

/**
 * The twelve to show.
 *
 * Starred first and rotated among themselves. Where there are fewer than
 * twelve stars the rest is topped up, in order, from everything else — a
 * trip with two starred photographs still fills the page.
 *
 * @param photos  every photograph on the trip
 * @param turn    how many times this recap has been opened
 */
export function forRecap(photos = [], turn = 0) {
  // Three states, not two. A photograph can be chosen, refused, or neither —
  // and "neither" is where every photograph starts, which is why a recap
  // fills itself before anybody has chosen anything.
  //
  // Two states could not express the thing somebody actually wants to do
  // here: take a picture out of the recap that they never put in. It was
  // showing because the page had room and it was next in order, and
  // unstarring an unstarred photograph does nothing.
  const all = photos.filter(Boolean)
  const starred = all.filter((p) => p.is_highlight === true)
  const rest = all.filter((p) => p.is_highlight == null)

  if (starred.length >= SHOWN) return windowOf(starred, turn)

  // Not enough chosen to fill the page, so the rest is a draw rather than
  // the first however-many in date order. Taking them in order meant a trip
  // was represented by its first morning: twelve pictures of an airport,
  // and the four days after it never seen by anybody who did not scroll.
  //
  // Shuffled by the same turn that rotates the chosen ones, so it is stable
  // for one viewing and for one shared link, and different when you come
  // back. Read in date order once drawn — a page of one trip should still
  // read as a day going past.
  const need = SHOWN - starred.length
  const filled = shuffled(rest, turn)
    .slice(0, need)
    .sort((a, b) => String(a.taken_on ?? '').localeCompare(String(b.taken_on ?? '')))
  return [...starred, ...filled]
}

/**
 * A shuffle that gives the same answer twice.
 *
 * Math.random() would reshuffle on every render — the grid would change
 * while somebody was looking at it, and two people opening the same link
 * would see different pages. This is a Fisher-Yates driven by a small
 * deterministic generator, seeded by the turn, so it is only as random as it
 * needs to be and no more.
 */
function shuffled(list, turn = 0) {
  const out = [...list]
  let seed = (turn * 2654435761 + 12345) >>> 0
  const next = () => {
    // xorshift32 — a few instructions, no dependency, and well past good
    // enough for deciding which photographs somebody sees today.
    seed ^= seed << 13
    seed >>>= 0
    seed ^= seed >>> 17
    seed ^= seed << 5
    seed >>>= 0
    return seed / 0x100000000
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Whether it is worth saying that there are more than fit. */
export function rotating(photos = []) {
  return photos.filter((p) => p?.is_highlight === true).length > SHOWN
}

/**
 * What the buttons on one photograph should say.
 *
 * `chosen` and `refused` are the two things somebody can have said about it;
 * neither is the state everything starts in. Tapping the one that is already
 * true takes it back to undecided, which is how a toggle should behave and
 * is the only way back to "let the app decide".
 */
export function standing(photo = {}) {
  if (photo.is_highlight === true) return 'chosen'
  if (photo.is_highlight === false) return 'refused'
  return 'undecided'
}

/** What tapping "always show" or "never show" sets it to. */
export function afterTap(photo = {}, want = 'chosen') {
  const now = standing(photo)
  if (want === 'chosen') return now === 'chosen' ? null : true
  return now === 'refused' ? null : false
}

const KEY = 'ph_recap_turn'

/**
 * Advance and read the counter for one trip.
 *
 * Held per trip, in localStorage, because it is a property of "how many
 * times have I looked at this" and belongs to the person looking rather
 * than to the trip. Somebody opening a shared link for the first time
 * starts at zero and sees the first twelve, which is the right first
 * impression.
 */
export function nextTurn(tripId, store = globalThis.localStorage) {
  if (!tripId || !store) return 0
  try {
    const all = JSON.parse(store.getItem(KEY) || '{}')
    const turn = Number(all[tripId] || 0) + 1
    store.setItem(KEY, JSON.stringify({ ...all, [tripId]: turn }))
    return turn
  } catch {
    return 0
  }
}
