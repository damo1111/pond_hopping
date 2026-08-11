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
  const all = photos.filter(Boolean)
  const starred = all.filter((p) => p.is_highlight)
  const rest = all.filter((p) => !p.is_highlight)

  if (starred.length >= SHOWN) return windowOf(starred, turn)

  // Not enough stars to fill it. The unstarred are a backdrop rather than a
  // choice, so they do not rotate — swapping them about would make the page
  // restless without making it better.
  return [...starred, ...rest.slice(0, SHOWN - starred.length)]
}

/** Whether it is worth saying that there are more than fit. */
export function rotating(photos = []) {
  return photos.filter((p) => p?.is_highlight).length > SHOWN
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
