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
    has: 'Days you wrote yourself',
    missing: 'Nothing written in your own words',
    get: 'Write a day',
    route: 'journal',
    // Never presented as a gap to fill: most people write nothing, and a
    // travel log that opens by telling you off is not one anybody keeps.
    optional: true,
  },
  {
    key: 'stays',
    has: 'Places you stopped',
    missing: 'No record of where you stopped',
    get: 'Add Timeline',
    route: 'timeline',
  },
  {
    key: 'photographs',
    has: 'Photographs',
    missing: 'No photographs yet',
    get: 'Add photos',
    route: 'photos',
  },
  {
    key: 'flights',
    has: 'Flights',
    missing: 'No flights on it',
    get: 'Add a booking',
    route: 'booking',
  },
  {
    key: 'runs',
    has: 'Runs',
    missing: 'No runs',
    get: 'Add runs',
    route: 'runs',
    optional: true,
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
 * The one line at the top.
 *
 * Says what it has before what it lacks, because the point is to make
 * somebody feel like adding one more thing rather than like they have failed
 * an inspection.
 */
export function summarise(facts = {}) {
  const rows = checklist(facts)
  const got = rows.filter((r) => r.got)
  if (!got.length) return 'Nothing on this trip yet.'
  const bits = got.map((r) => `${r.n.toLocaleString('en-GB')} ${plural(r, r.n)}`)
  return `${sentence(bits)} — that is plenty to write from.`
}

function plural(row, n) {
  const word = row.has.toLowerCase()
  if (row.key === 'said') return n === 1 ? 'day in your own words' : 'days in your own words'
  if (n === 1) return word.replace(/s$/, '')
  return word
}

function sentence(bits) {
  if (bits.length === 1) return bits[0]
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`
}
