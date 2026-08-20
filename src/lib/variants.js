// Two versions of a thing, and a way to find out which one works.
//
// ── The caveat that has to come first ─────────────────────────────────
//
// **This will not tell you anything for months.** Splitting a handful of
// people two ways and comparing tap rates is arithmetic, not evidence: at
// twenty hoppers a variant needs to be roughly twice as good before the
// difference clears the noise, and nothing anybody writes on a tile is twice
// as good as anything else anybody writes on a tile.
//
// So the reason to build it now is not to get an answer soon. It is that
// assignment has to be decided before the events are written, and events
// that do not carry a variant can never be re-analysed. Put the mechanism in
// early, let it accumulate quietly, and look at it when there is enough to
// look at. `enough()` below says when that is, out loud, so nobody has to
// guess and nobody gets to squint at four taps and call it a result.
//
// ── How assignment works ──────────────────────────────────────────────
//
// Hashed from the session id, which means it is decided on the device with
// no request, no wait and no flicker of the wrong variant first. The same
// person sees the same thing every time, which matters more here than it
// looks: a tile that changed between launches would be its own experience,
// and a worse one.

/**
 * What is being tested, and the versions of it.
 *
 * Kept as data so that adding a variant is one line and so the copy is
 * reviewable in one place — the same reason demoTour.js holds its steps as
 * data rather than JSX.
 *
 * A test with one variant is off, and that is the way to switch a test off:
 * leave the variants written down, delete none of them, and let the loser
 * stop being served. `docs/copy-variants.md` keeps the reasoning.
 */
export const TESTS = {
  /**
   * The tile on Home that opens "Tip it in". The only thing a new hopper
   * can actually do, so what it says is the highest-leverage sentence in
   * the app.
   */
  add_tile: [
    {
      id: 'tip-it-in',
      title: 'Tip it in',
      strap: 'Photos, a booking, whatever you have got',
    },
    {
      // A new id rather than an edit of 'trips-back', which is the habit
      // rather than a judgement about this particular arm: rewriting copy
      // under an id that has already been served blends two different
      // experiences into one label, and nothing afterwards can tell the rows
      // apart. Free to do here — there are no real users yet and the counts
      // against the old arm are this team testing — and the one time it
      // matters is the time somebody forgets.
      //
      // The old arm's copy, for the record:
      //   'Add a trip' / 'One you have taken, one you are on, or one you are
      //   planning'
      //
      // Why it was replaced: eleven words to say "any trip". Three
      // permutations of a single idea is an enumeration, and enumeration
      // belongs in a settings screen rather than on the first card a
      // stranger sees. Four words carry the same scope.
      //
      // "Get your trips back", the arm before that, asked somebody to notice
      // they had lost something and then sold them the recovery of it — a
      // puzzle before it is an offer, and only true of half the people
      // reading it.
      id: 'past-present-planned',
      title: 'Add a trip',
      strap: 'Past, present or planned',
    },
  ],
}

/**
 * A stable number from a string.
 *
 * FNV-1a: short, well spread, and no dependency. Cryptographic strength is
 * beside the point — this needs the same id to land in the same bucket
 * every time and different ids to spread evenly, and that is all.
 */
export function hashOf(said = '') {
  let h = 0x811c9dc5
  for (let i = 0; i < said.length; i++) {
    h ^= said.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * Stir the bits.
 *
 * FNV-1a spreads well across the whole word and badly in its lowest bit,
 * and `% 2` reads *only* the lowest bit. Multiplying by an odd prime leaves
 * bit zero as the XOR of bit zero of everything that went in, so
 * `hashOf('one:s0') % 2` and `hashOf('two:s0') % 2` agree whenever the two
 * prefixes have the same parity — which "one:" and "two:" do. The first
 * version of this file bucketed two independent tests identically for all
 * 400 sessions the test tried, and a test that always agrees with another
 * test is not an independent test at all.
 *
 * This is MurmurHash3's finaliser, which exists for exactly this: it
 * avalanches the high bits down into the low ones so every bit of the input
 * reaches every bit of the output.
 */
function spread(h) {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

/**
 * Which version this person gets.
 *
 * The test name is mixed into the hash, so somebody who lands in the first
 * bucket of one test is not thereby in the first bucket of every test —
 * without that, two tests running at once are one test with four arms and
 * neither result means anything.
 */
export function pickVariant(test, who, tests = TESTS) {
  const arms = tests[test]
  if (!Array.isArray(arms) || !arms.length) return null
  if (arms.length === 1) return arms[0]
  return arms[spread(hashOf(`${test}:${who ?? ''}`)) % arms.length]
}

/**
 * Is there enough to look at yet?
 *
 * Deliberately blunt, and deliberately in the code rather than in somebody's
 * head. Two hundred a side is the rough point at which a difference of ten
 * percentage points in a tap rate stops being indistinguishable from luck.
 * Below that this returns false and the honest report is "not yet".
 *
 * It does not compute a p-value, because a p-value invites a decision and
 * the decision here is only ever "keep waiting" or "now look properly".
 */
export const ENOUGH_EACH = 200

export function enough(counts = {}) {
  const arms = Object.values(counts)
  return arms.length >= 2 && arms.every((n) => (n ?? 0) >= ENOUGH_EACH)
}

/**
 * What the numbers say, with the warning attached.
 *
 * @param counts  { variantId: { shown, tapped } }
 */
export function howItLooks(counts = {}) {
  const rows = Object.entries(counts).map(([id, c]) => ({
    id,
    shown: c.shown ?? 0,
    tapped: c.tapped ?? 0,
    rate: c.shown ? Math.round((1000 * (c.tapped ?? 0)) / c.shown) / 10 : null,
  }))
  rows.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))
  const ready = enough(Object.fromEntries(rows.map((r) => [r.id, r.shown])))
  return {
    rows,
    ready,
    // The sentence to print, so nobody has to decide how confident to sound.
    says: ready
      ? `${rows[0].id} is ahead at ${rows[0].rate}% against ${rows[1]?.rate}%`
      : `not yet — ${ENOUGH_EACH} shows each is the earliest this means anything`,
  }
}
