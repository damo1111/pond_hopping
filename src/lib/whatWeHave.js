// What this trip has, and what it is missing, before anything gets written.
//
// The app will write a trip up from photographs alone, and does. What it
// will not do is mention that the booking inbox, the Google Timeline export
// and the runs were all sitting there unused — so the story comes out thinner
// than it needed to be and nobody knows why. David, 12 August: "where do we
// prompt the Hopper to curate the story or add more or add something else
// they may have".
//
// The moment to ask is before the writing starts, because that is when
// somebody is most willing: they have just watched the thing work and they
// want it to be good. Not after, when the answer is "well, it is written
// now".
//
// This turns the counts into a checklist. Ticked is what it has; unticked is
// a specific thing to go and get, named as an action rather than an absence.
// Nothing here blocks: writing now and adding more later is always allowed,
// and the copy says so, because a checklist that must be completed is a
// chore and a checklist you may ignore is an offer.

/**
 * In the order the reconstruction actually values them, which is not the
 * order anybody would guess — see whatThereIs() in storyBuild.js. Somebody's
 * own words beat everything; a recorded stay is the strongest evidence of
 * place there is; a photograph is third, because it is the only thing that
 * says what was *happening* and cannot say where you were in the four hours
 * you did not take one.
 */
export const HAVES = [
  {
    key: 'said',
    has: 'yours',
    missing: 'Nothing written in your own words',
    get: 'a day of your own',
    route: 'journal',
    weight: 3,
    colour: '#1A1611',
    // Never presented as a gap to fill: most people write nothing, and a
    // travel log that opens by telling you off is not one anybody keeps.
    optional: true,
  },
  {
    key: 'stays',
    has: 'places',
    missing: 'No record of where you stopped',
    get: 'your Timeline',
    route: 'timeline',
    weight: 3,
    colour: '#C97B95',
  },
  {
    key: 'photographs',
    has: 'photos',
    missing: 'No photographs yet',
    get: 'photos',
    route: 'photos',
    weight: 2,
    colour: '#A8842C',
  },
  {
    key: 'flights',
    has: 'flights',
    missing: 'No flights on it',
    get: 'a booking',
    route: 'booking',
    weight: 1,
    colour: '#3B7EA1',
  },
  {
    key: 'runs',
    has: 'runs',
    missing: 'No runs',
    get: 'runs',
    route: 'runs',
    optional: true,
    weight: 1,
    colour: '#3E7D54',
  },
]

/**
 * @param facts the shape whatThereIs() returns
 * @returns one row per kind, with a count and whether it is there
 */
export function checklist(facts = {}, kinds = HAVES) {
  return kinds.map((k) => {
    const n = Number(facts?.[k.key]) || 0
    return { ...k, n, got: n > 0, label: n > 0 ? k.has : k.missing }
  })
}

/**
 * Whether it is worth asking at all.
 *
 * A trip with everything does not need a screen telling it so, and a trip
 * with nothing cannot be written either way — the build refuses it, and this
 * should not pretend the choice exists.
 */
export function worthAsking(facts = {}) {
  const rows = checklist(facts)
  if (!rows.some((r) => r.got)) return false
  return rows.some((r) => !r.got && !r.optional)
}

/**
 * How much there is to write from, as a bar.
 *
 * Deliberately not weighted by count. Two hundred and thirty-eight
 * photographs against six flights would draw a bar that is almost entirely
 * photographs, which is true about the pile and false about the story: the
 * six flights fix the shape of the whole trip and the two hundredth
 * photograph of a beach adds nothing the hundredth did not.
 *
 * So each kind is worth what it is worth to the reconstruction — somebody's
 * own words and a recorded stay above photographs, photographs above the
 * rest — and having any of a kind fills its share. It is a picture of how
 * many *sorts* of evidence there are, which is the thing that actually makes
 * a story better and the thing somebody can do something about.
 */
export function richness(facts = {}, kinds = HAVES) {
  const rows = checklist(facts, kinds)
  const all = rows.reduce((n, r) => n + (r.weight ?? 1), 0)
  const have = rows.filter((r) => r.got).reduce((n, r) => n + (r.weight ?? 1), 0)
  return {
    rows,
    filled: all ? have / all : 0,
    // What it has first, then what it hasn't, each group still in value
    // order. Left to right the bar then reads "this much you have, this much
    // more is available" — with the value order alone, a trip missing the two
    // heaviest kinds opened with two empty blocks and looked like a failure
    // before the eye reached anything it had.
    segments: [...rows]
      .sort((a, b) => (a.got === b.got ? 0 : a.got ? -1 : 1))
      .map((r) => ({
        key: r.key,
        colour: r.colour,
        got: r.got,
        share: all ? (r.weight ?? 1) / all : 0,
      })),
  }
}

/**
 * The one line under the bar: what it has, in the fewest words that are
 * still true. "238 photos · 6 flights · 2 runs".
 */
export function summarise(facts = {}) {
  const got = checklist(facts).filter((r) => r.got)
  if (!got.length) return 'Nothing on this trip yet'
  return got.map((r) => `${r.n.toLocaleString('en-GB')} ${r.has}`).join(' · ')
}

/** The chips for what would make it better, best first, and never more than
 *  three — a list of everything you have not done is a chore. */
export function couldAdd(facts = {}, most = 3) {
  return checklist(facts)
    .filter((r) => !r.got)
    .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))
    .slice(0, most)
}
