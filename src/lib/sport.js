// Running is David's. Walking is everybody's.
//
// The table is called `runs` and every row was assumed to be one, which is
// true of this account and of nobody else's. Strava types every activity it
// records and the importer was discarding it.
//
// The section stays "Runs" for somebody whose activities are runs, and says
// "Walks" for somebody whose are walks — the heading follows the data
// rather than being renamed to something generic that suits nobody. An app
// that calls a 21 km run "an activity" has made itself worse for the person
// who ran it in order to be vaguely correct for everybody else.

/** What the app can hold. Anything else Strava sends becomes 'other',
 *  which still has a distance and a line on a map. */
export const SPORTS = ['run', 'walk', 'hike', 'ride', 'swim', 'other']

const WORDS = {
  run: { one: 'run', many: 'Runs', verb: 'run', icon: '🏃' },
  walk: { one: 'walk', many: 'Walks', verb: 'walked', icon: '🚶' },
  hike: { one: 'hike', many: 'Hikes', verb: 'hiked', icon: '🥾' },
  ride: { one: 'ride', many: 'Rides', verb: 'ridden', icon: '🚲' },
  swim: { one: 'swim', many: 'Swims', verb: 'swum', icon: '🏊' },
  other: { one: 'outing', many: 'Outings', verb: 'covered', icon: '📍' },
}

/** Strava's own type, made to fit. Free — it is already on every activity
 *  the importer reads, and was simply being dropped. */
export function toSport(raw) {
  const said = String(raw ?? '').toLowerCase().trim()
  if (SPORTS.includes(said)) return said
  if (/trail|virtual/.test(said) && /run/.test(said)) return 'run'
  if (/hik/.test(said)) return 'hike'
  if (/walk/.test(said)) return 'walk'
  if (/ride|cycl|bike|ebike/.test(said)) return 'ride'
  if (/swim/.test(said)) return 'swim'
  if (/run/.test(said)) return 'run'
  return 'other'
}

/** The words for a row.
 *
 *  An absent type on a table called `runs` is a run — every row written
 *  before the column existed is one, and calling those "outings" would be
 *  the schema's history leaking into somebody's holiday. A type Strava
 *  sent that we do not recognise is genuinely other. */
export const words = (sport) =>
  sport == null || sport === '' ? WORDS.run : (WORDS[toSport(sport)] ?? WORDS.other)

/** What to call the section, given what is actually in it. Somebody who
 *  only walks should not be reading a heading that says Runs. */
export function headingFor(activities = []) {
  const kinds = [...new Set(activities.map((a) => toSport(a?.sport)))]
  if (kinds.length === 1) return words(kinds[0]).many
  // Mixed, and all of it on foot, is still one word people use.
  if (kinds.every((k) => k === 'run' || k === 'walk' || k === 'hike')) return 'On foot'
  return 'Moving'
}

/** Somewhere you went under your own steam, with a track worth using to
 *  fill the gaps between photographs. A ride covers ground too fast to say
 *  much about a day, and a swim goes in circles. */
export const ON_FOOT = ['run', 'walk', 'hike']

export const isOnFoot = (a) => ON_FOOT.includes(toSport(a?.sport))
