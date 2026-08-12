// Reading the product numbers without lying to yourself.
//
// how_are_we_doing() hands back four integers per metric — a numerator and
// denominator for the last N days, and the same for the N before. It does no
// arithmetic on purpose. This does, and mostly what it does is refuse.
//
// A rate with a small denominator is not a small rate, it is noise wearing a
// percent sign. One person in three is 33% and one person in three hundred is
// 0.3%, and at three the number will be 0% or 50% next week for reasons that
// have nothing to do with the product. So nothing here states a rate until
// there is enough of it, and nothing states a movement until both halves are
// worth stating.
//
// This matters more here than in a bigger product, not less: at this scale
// almost every number is under the floor, and a dashboard that confidently
// reports 100% activation off two sessions is worse than no dashboard.

/** Below this, say the count and refuse the rate. */
export const ENOUGH = 20

/** A change smaller than this is not a change, it is next week's weather. */
export const WORTH_SAYING_PP = 3

/**
 * What each number is called, and which way is up.
 *
 * `bad: true` means a rising number is a worsening one. Two of these, and
 * both are easy to misread as wins on a chart that assumes growth is good.
 */
export const METRICS = [
  { key: 'opened', label: 'Opened the app', of: null },
  { key: 'people', label: 'Signed-in people', of: null },
  { key: 'bounced', label: 'Opened and did nothing', of: 'of those', bad: true },
  { key: 'did_something', label: 'Did something', of: 'of those' },
  { key: 'tapped_the_way_in', label: 'Tapped the way in', of: 'of those shown it' },
  { key: 'chose_a_route', label: 'Chose a route', of: 'of those who tapped' },
  { key: 'made_a_trip', label: 'Came away with a trip', of: 'of those who chose' },
  { key: 'typed_the_code', label: 'Typed the code we sent', of: 'of those who asked' },
  { key: 'got_in', label: 'And it let them in', of: 'of those who typed' },
  { key: 'came_back', label: 'Came back another day', of: 'of signed-in people' },
  { key: 'hit_a_fault', label: 'Hit something broken', of: 'of sessions', bad: true },
]

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** A share, or null when there is not enough underneath it to mean anything. */
export function rate(n, d, floor = ENOUGH) {
  const bottom = num(d)
  if (!(bottom >= floor) || bottom <= 0) return null
  return num(n) / bottom
}

/**
 * "56%" — no decimal, because a tenth of a percent here is invented precision.
 *
 * Settled to six places before rounding. 0.565 * 100 is 56.499999999999993
 * in binary floating point, so a plain round gives 56 where every human
 * reading it expects 57 — and a number that rounds differently from the one
 * you would get on paper is the kind of thing that quietly destroys trust in
 * a dashboard.
 */
export function asPercent(r) {
  if (r == null) return null
  return `${Math.round(Number((r * 100).toFixed(6)))}%`
}

/**
 * Which way it went, in percentage points, or null.
 *
 * Null when either half is too thin to state, and null again when the move is
 * inside the noise — a dashboard that reports every wobble as a trend trains
 * you to ignore it.
 */
export function movement(row, floor = ENOUGH, worth = WORTH_SAYING_PP) {
  const now = rate(row?.n, row?.d, floor)
  const before = rate(row?.n_before, row?.d_before, floor)
  if (now == null || before == null) return null
  const pp = (now - before) * 100
  return Math.abs(pp) < worth ? null : Math.round(pp)
}

/** For a plain count: how it moved, as a proportion, or null if it was tiny. */
export function countMovement(row, floor = 5) {
  const before = num(row?.n_before)
  if (before < floor) return null
  const pp = ((num(row?.n) - before) / before) * 100
  return Math.abs(pp) < 10 ? null : Math.round(pp)
}

/**
 * One metric, ready to render.
 *
 * `enough` is deliberately part of the answer rather than something the
 * caller works out: whether a number can be said at all is the first thing
 * about it, and leaving that to each screen is how a screen forgets.
 */
export function read(metric, rows = []) {
  const row = rows.find((r) => r.metric === metric.key) ?? {}
  const share = metric.of ? rate(row.n, row.d) : null
  const moved = metric.of ? movement(row) : countMovement(row)
  return {
    ...metric,
    n: num(row.n),
    d: metric.of ? num(row.d) : null,
    share,
    percent: asPercent(share),
    enough: metric.of ? share != null : true,
    moved,
    // Better or worse, having already accounted for the two metrics where
    // up is down.
    better: moved == null ? null : metric.bad ? moved < 0 : moved > 0,
  }
}

/** Every metric, in the order they should be read. */
export function readAll(rows = [], metrics = METRICS) {
  return metrics.map((m) => read(m, rows))
}
