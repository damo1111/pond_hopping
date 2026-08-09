// Which lounges you can actually use, right now, ranked.
//
// The whole feature turns on one example. David is oneworld Emerald. At
// Heathrow Terminal 3 his default is the Cathay Pacific First lounge. During
// Middle East disruption Cathay limited entry to their own passengers, and he
// was flying Finnair. Every stable fact was correct — the lounge exists, he
// is eligible by tier — and the recommendation was still wrong, because it
// sent him to the far end of a terminal to be turned away.
//
// So eligibility is answered in two passes. First: does any access rule let
// this person in. Second: is anything true this week that overrides it. A
// recommendation that skips the second pass is worse than no recommendation,
// because people plan around it.
//
// Everything here is pure. The data comes from Supabase; the judgement lives
// in the rows, not in the code.

// oneworld's tiers in the order they unlock things. Ruby gets you business
// lounges on some airlines, Sapphire reliably, Emerald gets first lounges.
// Star Alliance and SkyTeam have their own words for the same ladder.
const TIER_RANK = {
  emerald: 3, sapphire: 2, ruby: 1,        // oneworld
  gold: 2, silver: 1,                       // Star Alliance, SkyTeam Elite Plus ≈ gold
  platinum: 3, elite_plus: 2, elite: 1,     // programme-specific, mapped on the way in
}

const CABIN_RANK = { first: 3, business: 2, premium_economy: 1, economy: 0 }

const rank = (table, v) => table[String(v || '').toLowerCase().replace(/[\s-]+/g, '_')] ?? 0

/**
 * Does one access rule admit this traveller, and on what?
 *
 * Returns the rule with the thing they actually hold attached, or null. The
 * held status matters for what gets printed: the Qantas lounge takes
 * Sapphire and above, but telling an Emerald he is getting in "via oneworld
 * Sapphire" reads as a demotion. The rule is the door; the status is his.
 *
 * Deliberately generous on tier and cabin — a rule asking for Sapphire is
 * satisfied by an Emerald, and one asking for business is satisfied by a
 * first ticket — and strict on identity: a rule naming a programme or an
 * airline means that programme or that airline, not something adjacent.
 */
export function matchAccess(rule, traveller = {}) {
  if (!rule) return null
  const { statuses = [], cabin, airline } = traveller

  switch (rule.via) {
    case 'alliance_tier': {
      // Best card in the wallet, not the first one found: somebody can hold
      // Sapphire with one airline and Emerald with another.
      const held = statuses
        .filter(
          (s) =>
            (!rule.alliance || s.alliance === rule.alliance) &&
            rank(TIER_RANK, s.tier) >= rank(TIER_RANK, rule.tier)
        )
        .sort((a, b) => rank(TIER_RANK, b.tier) - rank(TIER_RANK, a.tier))[0]
      if (!held) return null
      // Alliance lounge access is earned by status but spent on an alliance
      // flight: Emerald on a low-cost carrier gets you nothing.
      if (rule.same_alliance_flight && traveller.flightAlliance !== rule.alliance) return null
      return { ...rule, held }
    }
    case 'cabin':
      return rank(CABIN_RANK, cabin) >= rank(CABIN_RANK, rule.cabin) &&
        (!rule.airline || rule.airline === airline)
        ? { ...rule }
        : null
    case 'programme': {
      const held = statuses.find((s) => s.programme && s.programme === rule.programme)
      return held ? { ...rule, held } : null
    }
    case 'priority_pass':
      return traveller.priorityPass ? { ...rule } : null
    case 'card':
      return (traveller.cards || []).includes(rule.programme) ? { ...rule } : null
    case 'paid':
      return { ...rule } // always an option, just never the recommended one
    default:
      return null
  }
}

/** The same question, when only yes or no is wanted. */
export function admits(rule, traveller = {}) {
  return matchAccess(rule, traveller) !== null
}

/**
 * Conditions in force at a moment, newest first.
 *
 * An open-ended condition decays rather than asserting forever: after
 * DECAY_DAYS it stops claiming to be current and starts being reported as
 * something somebody once saw. Stale certainty is worse than admitted doubt
 * — it is the difference between "entry is limited" and "was reported
 * limited on 3 Aug", and only one of those is honest a month later.
 */
export const DECAY_DAYS = 14

export function activeConditions(conditions = [], now = new Date()) {
  const t = new Date(now).getTime()
  return conditions
    .filter((c) => {
      if (new Date(c.starts_at).getTime() > t) return false
      if (c.ends_at) return new Date(c.ends_at).getTime() > t
      return true
    })
    .map((c) => {
      const days = (t - new Date(c.starts_at).getTime()) / 86400000
      // Official notices don't rot the way a passing observation does.
      const stale = !c.ends_at && c.source_type === 'member_report' && days > DECAY_DAYS
      return { ...c, stale, ageDays: Math.floor(days) }
    })
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
}

/** Does a condition shut this traveller out, as opposed to merely warning them? */
function blocks(condition, traveller) {
  if (condition.stale) return false // decayed to a note, not a rule
  if (condition.kind === 'closed' || condition.kind === 'refurbishment') return true
  if (condition.kind === 'access_restricted') {
    // Cathay's case: eligible by tier, still not getting in on Finnair.
    if (condition.airlines?.length) return !condition.airlines.includes(traveller.airline)
    return true
  }
  return false // capacity and hours changes are warnings, not walls
}

/**
 * The answer. Lounges this traveller can use at this airport and terminal,
 * best first, each able to say how they got in and what to watch out for.
 *
 * @param {object} traveller { statuses, cabin, airline, flightAlliance, priorityPass, cards }
 * @param {Array}  lounges   rows with .access and .conditions attached
 */
export function loungesFor(traveller = {}, lounges = [], now = new Date()) {
  return lounges
    .map((l) => {
      const conditions = activeConditions(l.conditions, now)
      const ways = (l.access || []).map((r) => matchAccess(r, traveller)).filter(Boolean)
      // Paid entry is a fallback, never a reason to recommend somewhere. Of
      // the free routes, name the most generous one — the same door, but the
      // one that brings a guest in with you.
      const free = ways
        .filter((r) => r.via !== 'paid')
        .sort((a, b) => (b.guests ?? 0) - (a.guests ?? 0))
      const blocked = conditions.find((c) => blocks(c, traveller))
      return {
        lounge: l,
        ways,
        // The sentence the card prints: how you're getting in.
        via: free[0] || ways[0] || null,
        guests: Math.max(0, ...free.map((r) => r.guests ?? 0)),
        conditions,
        blocked: blocked || null,
        eligible: ways.length > 0,
        free: free.length > 0,
      }
    })
    .filter((r) => r.eligible)
    .sort((a, b) => {
      // Somewhere you can't get into today ranks below somewhere you can,
      // however good it is on an ordinary week.
      if (Boolean(a.blocked) !== Boolean(b.blocked)) return a.blocked ? 1 : -1
      // A lounge you can walk into beats a better one you'd have to buy your
      // way into. The best lounge in the terminal is not the answer to
      // "where should I go" if the answer costs £110.
      if (a.free !== b.free) return a.free ? -1 : 1
      // Then editorial judgement, which is the whole point of the dataset.
      return (a.lounge.rank ?? 99) - (b.lounge.rank ?? 99)
    })
}

/** The one to actually go to, or null when there isn't one. */
export function bestLounge(traveller, lounges, now = new Date()) {
  return loungesFor(traveller, lounges, now).find((r) => !r.blocked) || null
}

/** "oneworld Emerald", "Business class", "Qantas Club" — how you got in. */
export function describeAccess(way) {
  if (!way) return null
  switch (way.via) {
    case 'alliance_tier': {
      // What they hold, falling back to what the door asks for.
      const tier = way.held?.tier || way.tier
      return [way.alliance, tier && tier[0].toUpperCase() + tier.slice(1)].filter(Boolean).join(' ')
    }
    case 'cabin':
      return `${way.cabin[0].toUpperCase()}${way.cabin.slice(1)} class`
    case 'programme':
      return way.programme
    case 'priority_pass':
      return 'Priority Pass'
    case 'card':
      return way.programme
    case 'paid':
      return way.price ? `Paid entry, ${way.price}` : 'Paid entry'
    default:
      return null
  }
}
