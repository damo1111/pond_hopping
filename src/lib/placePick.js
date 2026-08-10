// Which place a stop actually was.
//
// A GPS fix is a point. A trip is made of places. Reverse geocoding turns
// the first into candidates for the second, and most of the time the answer
// is obvious: one thing within fifty metres, nothing else close. Stand
// outside the Colosseum and there is exactly one answer.
//
// Sometimes it is not obvious, and that is the interesting case. A stall in
// Borough Market has forty neighbours inside the accuracy of the fix. A
// restaurant on the second floor of a building with six others in it is a
// coin toss from coordinates alone. No amount of arithmetic settles those,
// because the information simply is not in the numbers.
//
// It IS in the photograph. So the rule this file exists to express: look at
// the pictures only where the coordinates have run out of answers, and when
// you do, hand the model the candidate list so it is choosing between real
// neighbours rather than inventing a name. That keeps a three-hundred-photo
// trip to a handful of image calls — one or two photographs at the few
// stops that are genuinely ambiguous — instead of one call per photograph
// to ask three hundred times what is already known.

/** Inside this, a candidate is "at" the stop rather than near it. */
export const CLOSE_M = 60

/** A stop this long is somewhere you went, not somewhere you passed. */
export const DESTINATION_MINUTES = 25

/** The nearest has to be this much nearer than the runner-up to win on
 *  distance alone. Anything less and they are the same spot to a phone. */
export const CLEARLY_NEARER = 2.5

// Categories somebody spends an afternoon in, as against ones they happen
// to stand next to. Used to break ties, never to filter: a stop is allowed
// to be a launderette.
const DESTINATIONS = [
  'museum', 'gallery', 'monument', 'landmark', 'historic', 'ruins', 'castle',
  'church', 'cathedral', 'temple', 'shrine', 'park', 'garden', 'zoo', 'aquarium',
  'stadium', 'theater', 'theatre', 'restaurant', 'bar', 'cafe', 'café', 'market',
  'beach', 'viewpoint', 'plaza', 'square', 'bridge', 'palace',
]

const isDestination = (c) => DESTINATIONS.some((w) => `${c?.category ?? ''}`.toLowerCase().includes(w))

// A square is a place; the obelisk in the middle of it is furniture.
//
// Rome, 24 January, an hour and a half in the evening at 41.8986,12.4732.
// Inside the fix: an obelisk, the Fountain of the Four Rivers and the
// Fontana del Moro. The answer came back "Obelisco Agonalis", because the
// obelisk is a monument, the word list knows "monument", and it happened to
// be nearest. Piazza Navona — which is what all three of those things are
// standing in — sat three metres outside CLOSE_M and was never considered.
//
// The rule below: something you can be *inside* wins over the things it
// contains, but only when everything at the point is a feature of it.
const CONTAINERS = ['plaza', 'square', 'park', 'garden', 'piazza']
const FEATURES = ['monument', 'fountain', 'statue', 'obelisk', 'historic', 'landmark', 'memorial']

const said = (c) => `${c?.category ?? ''}`.toLowerCase()
const isContainer = (c) => CONTAINERS.some((w) => said(c).includes(w))
const isFeature = (c) => FEATURES.some((w) => said(c).includes(w))

/** How far out to look for the thing the features are standing in. A square
 *  is measured to its centre, so you can be well inside it and still be
 *  further from that centre than from the fountain you are next to. */
export const CONTAINER_M = 120

/**
 * The square these things are standing in, if that is all they are.
 *
 * Deliberately narrow. If anything at the point is somewhere you go into —
 * a stall, a restaurant, a bar — this returns nothing and the stop goes to
 * the photograph, which is the whole design: Borough Market has to stay a
 * question about which stall, not get flattened to "Borough Market".
 */
function containing(inside, near) {
  if (!inside.length || !inside.every(isFeature)) return null
  const found = near.find((n) => isContainer(n) && n.metres <= CONTAINER_M)
  return found && !inside.includes(found) ? found : null
}

/**
 * What to do about one stop.
 *
 * @param stop        from photoDays.stopsIn()
 * @param candidates  [{ id, name, category, metres }], nearest first-ish
 * @returns { verdict, place, shortlist, why }
 *   'settled'   — `place` is the answer, no photograph needed
 *   'ambiguous' — `shortlist` is worth showing a photograph to
 *   'nowhere'   — nothing is there; the coordinates are the whole answer
 */
export function pickPlace(stop = {}, candidates = []) {
  const near = [...candidates]
    .filter((c) => c && Number.isFinite(c.metres))
    .sort((a, b) => a.metres - b.metres)

  if (!near.length) return { verdict: 'nowhere', place: null, shortlist: [], why: 'nothing mapped here' }

  const inside = near.filter((c) => c.metres <= CLOSE_M)

  // Nothing actually at the point, but something near it. One thing near it
  // is an answer; several are not worth a photograph either, because none
  // of them is where the picture was taken.
  if (!inside.length) {
    return near.length === 1 || near[1].metres / near[0].metres >= CLEARLY_NEARER
      ? { verdict: 'settled', place: near[0], shortlist: [], why: 'the only thing nearby' }
      : { verdict: 'nowhere', place: null, shortlist: [], why: 'nothing close enough to name' }
  }

  // Everything here is furniture, and there is a square for it to stand in.
  const square = containing(inside, near)
  if (square) return { verdict: 'settled', place: square, shortlist: [], why: 'the square they are all standing in' }

  if (inside.length === 1)
    return { verdict: 'settled', place: inside[0], shortlist: [], why: 'the only thing here' }

  // Several things at the same point. If one of them is somewhere you
  // spend time and the others are not, and the stop lasted like a visit
  // rather than a pause, that is a real signal — an hour and a half at a
  // point shared by a museum and two dry cleaners was the museum.
  //
  // It must also be the nearest, and that condition is doing more work than
  // it looks. Without it the rule leans entirely on a word list, and a word
  // list is exactly the wrong tool in a food market, where a bakery and a
  // cheese stall are every bit as much places you linger as the cafe that
  // happens to be the one the list recognises. Requiring "closest as well
  // as only" keeps the rule to the case it was written for — a stark
  // contrast, not a vocabulary gap — and sends the market to the
  // photographs, which is where it belongs.
  const long = (stop.minutes ?? 0) >= DESTINATION_MINUTES
  const destinations = inside.filter(isDestination)
  if (long && destinations.length === 1 && destinations[0] === inside[0])
    return { verdict: 'settled', place: destinations[0], shortlist: [], why: 'the only one you could spend an hour in' }

  // Genuinely several. This is the Borough Market case, and the only thing
  // that can separate them is what the photograph shows.
  return {
    verdict: 'ambiguous',
    place: null,
    shortlist: (destinations.length > 1 ? destinations : inside).slice(0, 8),
    why: 'several places at the same spot',
  }
}

/** Where the photographs are worth looking at, and where they are not.
 *
 *  The point of the whole exercise: this is how a three-hundred-photograph
 *  trip costs a handful of image calls rather than three hundred. */
export function plan(stops = [], candidatesFor = () => []) {
  return stops.map((stop, i) => ({ stop, i, ...pickPlace(stop, candidatesFor(stop, i)) }))
}

/** How many photographs to show for an ambiguous stop.
 *
 *  Two, from the middle of the stop rather than the ends — the first shot
 *  is often the walk up to a place and the last is often leaving it. One
 *  photograph is a coin toss if it happens to be of the floor; a dozen is
 *  paying twelve times over for an answer two would have given. */
export function askWith(stop = {}, howMany = 2) {
  const shots = stop.photos ?? []
  if (shots.length <= howMany) return shots
  const middle = Math.floor(shots.length / 2)
  const from = Math.max(0, middle - Math.floor(howMany / 2))
  return shots.slice(from, from + howMany)
}
