// Where somebody lives, and how we guess it before asking.
//
// Home is the one thing about a trip the app cannot work out for itself.
// Dates, places, how long, how far — all of that falls out of the photographs.
// Home does not, and without it the word "away" has no meaning: "you've been
// away five days" is a sentence the app literally cannot write until somebody
// says where they came from.
//
// So it is asked first, on its own screen, and it is the only question in the
// opening minute. Everything here exists to make that question cost one tap
// instead of a search.

/**
 * The three David's testers are in, in the order they were given.
 *
 * Not a claim about the world — a claim about who is about to open this. It
 * changes when that changes.
 */
export const COMMON = ['gb', 'au', 'us']

/**
 * Timezone → country, for the zones that actually matter here.
 *
 * The full tzdb mapping is some four hundred rows and would be dead weight:
 * this needs to be *right* for the three above and *harmless* everywhere
 * else, because a wrong guess costs one tap and a missing guess costs one
 * tap. Neither is worth four hundred rows.
 *
 * Kept deliberately broad — every Australian zone, not just the capitals —
 * because somebody in Broken Hill is no less Australian for it.
 */
const ZONES = {
  'europe/london': 'gb',
  'europe/belfast': 'gb',
  'europe/jersey': 'gb',
  'europe/guernsey': 'gb',
  'europe/isle_of_man': 'gb',
  'europe/dublin': 'ie',
  'europe/paris': 'fr',
  'europe/berlin': 'de',
  'europe/madrid': 'es',
  'europe/rome': 'it',
  'europe/amsterdam': 'nl',
  'europe/lisbon': 'pt',
  'pacific/auckland': 'nz',
  'asia/singapore': 'sg',
  'asia/hong_kong': 'hk',
  'asia/tokyo': 'jp',
  'asia/seoul': 'kr',
  'asia/bangkok': 'th',
  'asia/shanghai': 'cn',
  'asia/kuala_lumpur': 'my',
  'asia/colombo': 'lk',
}

// Anything under these belongs to one country, whichever city follows.
const REGIONS = {
  australia: 'au',
  'america/toronto': 'ca',
  'america/vancouver': 'ca',
  'america/montreal': 'ca',
  'america/edmonton': 'ca',
  'america/winnipeg': 'ca',
  'america/halifax': 'ca',
  'us/': 'us',
  'america/': 'us',
}

/**
 * A first guess at where somebody lives, from things the phone will say
 * without being asked.
 *
 * No permission prompt, no dialog, no GPS — which is the entire point. A
 * location permission asked before anybody has seen what the app does is the
 * fastest way to be denied it forever, and this needs none.
 *
 * Two sources, deliberately in this order:
 *
 *   The timezone says where the phone *is*, which is nearly always where its
 *   owner lives. It is wrong exactly when somebody sets this up mid-trip —
 *   which, given the app, is a real fraction of people.
 *
 *   The locale region says where the phone was *set up*, which survives
 *   travelling. It is wrong for anybody who lives abroad and never changed it.
 *
 * Neither is trusted: the answer is pre-selected, never assumed, and the
 * screen still asks. A guess that is right saves a tap. A guess that is wrong
 * costs nothing, because the three choices are all on screen anyway.
 *
 * @returns a two-letter lowercase code, or null if neither source knows
 */
export function guessHome(
  zone = timeZone(),
  locale = globalThis.navigator?.language ?? globalThis.navigator?.languages?.[0]
) {
  const tz = String(zone || '').toLowerCase()
  if (ZONES[tz]) return ZONES[tz]
  for (const [prefix, code] of Object.entries(REGIONS)) {
    if (tz.startsWith(prefix)) return code
  }
  // "en-GB" → gb. Never a language on its own: plain "en" says nothing about
  // where anybody is, and guessing the United States from it is exactly the
  // assumption this app should not make.
  const region = String(locale || '').split('-')[1]
  return region && /^[a-z]{2}$/i.test(region) ? region.toLowerCase() : null
}

function timeZone() {
  try {
    return globalThis.Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone ?? ''
  } catch {
    return ''
  }
}

/**
 * The countries offered without typing, guess first.
 *
 * The guess goes on top whatever it is — if somebody is in Canada it is
 * absurd to make them search for Canada while three other countries sit above
 * it — and the three defaults follow, minus whichever one the guess already
 * is. Always at least three, never a duplicate.
 */
export function choices(guess = guessHome(), common = COMMON) {
  const head = guess && !common.includes(guess) ? [guess] : []
  const rest = guess && common.includes(guess) ? [guess, ...common.filter((c) => c !== guess)] : common
  return [...head, ...rest]
}

/**
 * What people call countries, as opposed to what the standard calls them.
 *
 * Somebody typing "England" is not going to be told there is no such place,
 * and somebody typing "UK" should not have to discover that the app wants
 * "United Kingdom". Each of these is a real thing a real person types.
 */
const ALIASES = {
  gb: ['uk', 'united kingdom', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland'],
  us: ['usa', 'us', 'united states', 'america', 'the states'],
  nl: ['holland', 'the netherlands'],
  ae: ['uae', 'dubai', 'abu dhabi'],
  kr: ['south korea', 'korea'],
  cz: ['czech republic', 'czechia'],
  ie: ['ireland', 'eire'],
  ch: ['switzerland'],
  za: ['south africa'],
  nz: ['new zealand'],
}

/**
 * Every country, as two-letter codes.
 *
 * Only the codes: the *names* come from Intl.DisplayNames at the point of
 * use, which means they arrive in the reader's own language for free and
 * there is no list of two hundred and fifty English strings in this file to
 * drift out of date the next time a country renames itself.
 */
export const CODES =
  ('ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bw by bz ' +
    'ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm ' +
    'fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hn hr ht hu id ie il im in io iq ir is it ' +
    'je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm ' +
    'mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ' +
    'ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th ' +
    'tj tk tl tm tn to tr tt tv tw tz ua ug us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw').split(' ')

let namer = null

/** "gb" → "United Kingdom", in the reader's language where the browser has one. */
export function nameOf(code) {
  const iso = String(code || '').toUpperCase()
  if (iso.length !== 2) return ''
  try {
    namer ??= new Intl.DisplayNames(undefined, { type: 'region' })
    return namer.of(iso) || iso
  } catch {
    // Intl.DisplayNames missing, or asked about something it does not know.
    // The code itself is a poor label but it is a true one, and it keeps the
    // row tappable rather than blank.
    return iso
  }
}

/**
 * Countries matching what has been typed.
 *
 * Matches the start of the name rather than anywhere inside it, because
 * substring matching puts Turkmenistan above Oman for "man" and the list
 * stops looking like it understood. Aliases match the same way, so "eng"
 * finds the United Kingdom and "hol" finds the Netherlands.
 *
 * An empty query is not "everything" — it is the un-searched state, and the
 * caller shows `choices()` there instead. Two hundred and fifty rows in
 * alphabetical order is not an answer to a question nobody has asked.
 */
export function search(query, codes = CODES) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const hits = []
  for (const code of codes) {
    const name = nameOf(code).toLowerCase()
    const aliases = ALIASES[code] ?? []
    const rank = rankOf(q, name, aliases)
    if (rank != null) hits.push({ code, name: nameOf(code), rank })
  }
  return hits.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
}

/**
 * How well a query matches one country. Lower is better, null is no match.
 *
 * The exact tier is not a nicety. Ranking prefixes alone, typing "uk" returned
 * **Ukraine** — its name begins with those two letters and sorts before United
 * Kingdom — so the single most likely thing a British tester types found the
 * wrong country. Anything somebody has typed in full, name or nickname, has to
 * beat everything they have merely started.
 */
function rankOf(q, name, aliases) {
  if (name === q || aliases.includes(q)) return 0
  if (name.startsWith(q) || aliases.some((a) => a.startsWith(q))) return 1
  // A word inside the name still counts — "guinea" should find Papua New
  // Guinea — but it sorts below anything that starts with it.
  if (name.split(/[\s-]+/).some((w) => w.startsWith(q))) return 2
  return null
}
