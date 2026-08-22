import { regionsVisited } from './neverBeen.js'

// What to put in the space under the last card.
//
// The Plan tab ran out of things to say a third of the way down the screen and
// the rest was white. David: "still too much empty space here, especially
// beneath the third card." The answer is not a taller card — it is that a tab
// about what happens next should always have something to suggest.
//
// ── Where these come from ─────────────────────────────────────────────────
//
// Two sources, both free, deliberately chosen because neither needs a price
// feed or an API key:
//
//   Somewhere they have never been. Every trip already carries the airports it
//   flew through, so the gap in somebody's map costs nothing to work out —
//   neverBeen.js has done this for the empty state for a while and this reuses
//   its regions rather than inventing a second opinion about where anyone has
//   been.
//
//   The season. "October is cheap for Japan" is an almanac, not a feed. It is
//   true every year and it never goes down.
//
// Real prices are a third source and a much more expensive one — see the
// backlog. The preview a card opens is written so that adding them later
// changes the numbers rather than the shape.

/**
 * Places worth suggesting, with the months they are best.
 *
 * Small and hand-written on purpose. A generated list of five hundred
 * destinations would say nothing; twelve chosen ones can each carry a reason,
 * and the reason is the only part anybody reads.
 *
 * `art` names a drawing rather than a photograph. A photograph of Rome on a
 * suggestion card is a stock image and reads as an advert; a line drawing in
 * the app's own gold reads as the app talking.
 */
export const PLACES = [
  { id: 'rome',      name: 'Rome',        region: 'europe',          months: [4, 5, 10],        art: 'colosseum', note: 'Three nights is the usual' },
  { id: 'venice',    name: 'Venice',      region: 'europe',          months: [4, 5, 9, 10],     art: 'gondola',   note: 'Two hours from Rome' },
  { id: 'lisbon',    name: 'Lisbon',      region: 'europe',          months: [3, 4, 5, 9, 10],  art: 'tram',      note: 'Cheap, and warm in March' },
  { id: 'japan',     name: 'Japan',       region: 'east-asia',       months: [3, 4, 10, 11],    art: 'torii',     note: 'Blossom, or the maples' },
  { id: 'patagonia', name: 'Patagonia',   region: 'south-america',   months: [11, 12, 1, 2],    art: 'peak',      note: 'Their summer is our winter' },
  { id: 'morocco',   name: 'Marrakech',   region: 'africa',          months: [3, 4, 10, 11],    art: 'arch',      note: 'Before the heat arrives' },
  { id: 'vietnam',   name: 'Hanoi',       region: 'south-east-asia', months: [10, 11, 12, 3],   art: 'temple',    note: 'The dry half of the year' },
  { id: 'norway',    name: 'the fjords',  region: 'europe',          months: [6, 7, 8],         art: 'peak',      note: 'Light until midnight' },
  { id: 'samarkand', name: 'Samarkand',   region: 'central-asia',    months: [4, 5, 9, 10],     art: 'arch',      note: 'The Silk Road, still there' },
  { id: 'sri-lanka', name: 'Sri Lanka',   region: 'south-asia',      months: [1, 2, 3, 12],     art: 'temple',    note: 'Tea country, then the coast' },
  { id: 'fiji',      name: 'Fiji',        region: 'oceania',         months: [5, 6, 7, 8, 9],   art: 'ship',      note: 'Their winter is the dry one' },
  { id: 'petra',     name: 'Petra',       region: 'middle-east',     months: [3, 4, 10, 11],    art: 'arch',      note: 'Walk in at dawn' },
]

/**
 * Ideas, best first.
 *
 * Ranked, not shuffled. A strip that says something different on every render
 * reads as noise rather than as a suggestion — and this one drifts past on a
 * loop, so a changing order would be visibly wrong within about four seconds.
 *
 * Somewhere they have never been outranks somewhere they have, and being in
 * season outranks being out of it. Both together is the best a free suggestion
 * gets: a corner of the world with no pin in it, at the time of year to go.
 */
export function ideasFor({ flights = [], month = new Date().getMonth() + 1, limit = 8 } = {}) {
  const been = regionsVisited(flights)
  // Not the same question as "have they been there". With no flights at all —
  // signed out, or signed in with nothing added yet, which is most people
  // looking at this strip — we do not know where anybody has been, and an
  // empty history is not evidence of an empty map.
  //
  // Rendered without this, the strip told a signed-out David he had been
  // "nowhere near" Rome, which he has been to twice. Saying nothing is the
  // only honest option, and the season still has plenty to say.
  const known = been.size > 0
  return PLACES.map((p) => {
    const fresh = known && !been.has(p.region)
    const inSeason = p.months.includes(month)
    return {
      ...p,
      fresh,
      inSeason,
      // 0 is new and in season, 3 is somewhere they know at the wrong time.
      rank: (fresh ? 0 : 2) + (inSeason ? 0 : 1),
      why: reasonFor({ fresh, inSeason, note: p.note }),
    }
  })
    .sort((a, b) => a.rank - b.rank || PLACES.indexOf(a) - PLACES.indexOf(b))
    .slice(0, limit)
}

/**
 * The line under the name, which is the only part anybody reads.
 *
 * "You have never been" is the strongest thing this app can say and it is only
 * true of a region with no pin in it, so it is never said about anywhere else.
 * Everything below it falls back to something true and specific rather than to
 * a slogan.
 */
function reasonFor({ fresh, inSeason, note }) {
  if (fresh && inSeason) return 'Never been — and now is the time'
  if (fresh) return 'Nowhere near it, ever'
  if (inSeason) return 'Right time of year'
  return note
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * One line for the foot of the tab, or null.
 *
 * Deliberately not a card. It is an aside — the almanac muttering that if you
 * were going to go, it would be soon — and putting a box round it would make
 * it a third competing thing on a screen that already has a lane and a strip.
 *
 * Looks a month ahead rather than at today, because a suggestion you can still
 * act on is worth more than one about the week you are in.
 */
export function seasonalNote(month = new Date().getMonth() + 1, places = PLACES) {
  const next = (month % 12) + 1
  const soon = places.filter((p) => p.months.includes(next))
  if (!soon.length) return null
  return `${MONTHS[next - 1]} is the month for ${soon[0].name}`
}
