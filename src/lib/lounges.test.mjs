import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DECAY_DAYS,
  FREE,
  PER_VISIT,
  WALK_IN,
  activeConditions,
  admits,
  bestLounge,
  describeAccess,
  loungesFor,
  visitsLeft,
} from './lounges.js'

// The lounge networks, as they actually work. Priority Pass Standard
// includes no visits at all; Standard Plus includes ten; Prestige is
// unlimited. Amex Platinum hands you a Prestige-equivalent membership.
const prestige = { network: 'Priority Pass', tier: 'prestige', unlimited: true }
const standardPlus = (used) => ({
  network: 'Priority Pass',
  tier: 'standard_plus',
  visitsIncluded: 10,
  visitsUsed: used,
  visitFee: '£32',
})

// Heathrow Terminal 3, as close to the real thing as fixtures get. The rows
// mirror the Supabase shape exactly, because a test that passes against a
// convenient shape proves nothing about the query that feeds it.
const cathayFirst = {
  id: 'cx-first',
  airport: 'LHR',
  terminal: '3',
  name: 'Cathay Pacific First Class Lounge',
  operator: 'Cathay Pacific',
  rank: 1,
  access: [
    { via: 'alliance_tier', alliance: 'oneworld', tier: 'emerald', same_alliance_flight: true, guests: 1 },
    { via: 'cabin', cabin: 'first', airline: 'CX', guests: 1 },
  ],
  conditions: [],
}

const qantas = {
  id: 'qf-london',
  airport: 'LHR',
  terminal: '3',
  name: 'Qantas London Lounge',
  operator: 'Qantas',
  rank: 2,
  access: [
    { via: 'alliance_tier', alliance: 'oneworld', tier: 'sapphire', same_alliance_flight: true, guests: 1 },
    { via: 'cabin', cabin: 'business', guests: 0 },
    { via: 'programme', programme: 'Qantas Club', guests: 1 },
    { via: 'paid', price: '£65' },
  ],
  conditions: [],
}

const americanGreenwich = {
  id: 'aa-greenwich',
  airport: 'LHR',
  terminal: '3',
  name: 'American Airlines Greenwich Lounge',
  operator: 'American Airlines',
  rank: 4,
  access: [
    { via: 'alliance_tier', alliance: 'oneworld', tier: 'sapphire', same_alliance_flight: true, guests: 1 },
  ],
  conditions: [],
}

const plazaPremium = {
  id: 'plaza-t3',
  airport: 'LHR',
  terminal: '3',
  name: 'Plaza Premium Lounge',
  rank: 6,
  access: [
    { via: 'network', programme: 'Priority Pass', guests: 0 },
    { via: 'card', programme: 'Amex Platinum', guests: 1 },
    { via: 'paid', price: '£45' },
  ],
  conditions: [],
}

const t3 = [cathayFirst, qantas, americanGreenwich, plazaPremium]

// David, exactly as the app will know him.
const david = {
  statuses: [{ programme: 'British Airways Executive Club', alliance: 'oneworld', tier: 'emerald' }],
  cabin: 'economy',
  airline: 'AY',
  flightAlliance: 'oneworld',
}

const now = new Date('2026-08-09T09:00:00Z')
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString()

const restrictedToCathay = {
  kind: 'access_restricted',
  summary: 'Entry limited to Cathay Pacific passengers',
  airlines: ['CX'],
  starts_at: daysAgo(3),
  ends_at: null,
  source_type: 'member_report',
  confirmations: 2,
}

const withConditions = (lounge, ...conditions) => ({ ...lounge, conditions })

// ---------------------------------------------------------------------------
// The case the whole feature exists for.
// ---------------------------------------------------------------------------

test('Emerald on Finnair is sent to Qantas while Cathay are only taking their own', () => {
  const lounges = [withConditions(cathayFirst, restrictedToCathay), qantas, americanGreenwich, plazaPremium]
  const best = bestLounge(david, lounges, now)

  assert.equal(best.lounge.name, 'Qantas London Lounge')
  assert.equal(describeAccess(best.via), 'oneworld Emerald')
  assert.equal(best.guests, 1)
})

test('the same traveller on Cathay metal is sent to Cathay', () => {
  const lounges = [withConditions(cathayFirst, restrictedToCathay), qantas, americanGreenwich, plazaPremium]
  const best = bestLounge({ ...david, airline: 'CX' }, lounges, now)

  assert.equal(best.lounge.name, 'Cathay Pacific First Class Lounge')
})

test('Cathay is still listed, with the reason it is out, rather than quietly dropped', () => {
  const lounges = [withConditions(cathayFirst, restrictedToCathay), qantas]
  const [first, second] = loungesFor(david, lounges, now)

  // Somewhere you can get into today outranks somewhere better that you can't.
  assert.equal(first.lounge.name, 'Qantas London Lounge')
  assert.equal(second.lounge.name, 'Cathay Pacific First Class Lounge')
  assert.equal(second.eligible, true)
  assert.equal(second.blocked.summary, 'Entry limited to Cathay Pacific passengers')
})

// ---------------------------------------------------------------------------
// Conditions: what is true this week, and for how long it gets to claim it.
// ---------------------------------------------------------------------------

test('a member report with no end date stops blocking once it has decayed', () => {
  const old = { ...restrictedToCathay, starts_at: daysAgo(DECAY_DAYS + 1) }
  const lounges = [withConditions(cathayFirst, old), qantas]
  const best = bestLounge(david, lounges, now)

  assert.equal(best.lounge.name, 'Cathay Pacific First Class Lounge')
  // Still worth saying out loud — it has become a note, not a rule.
  assert.equal(best.conditions[0].stale, true)
  assert.equal(best.conditions[0].ageDays, DECAY_DAYS + 1)
  assert.equal(best.blocked, null)
})

test('an official notice does not decay the way a passing observation does', () => {
  const official = {
    ...restrictedToCathay,
    starts_at: daysAgo(90),
    source_type: 'official',
    source_url: 'https://cathaypacific.com/…',
  }
  const lounges = [withConditions(cathayFirst, official), qantas]

  assert.equal(bestLounge(david, lounges, now).lounge.name, 'Qantas London Lounge')
})

test('a closure blocks everybody, whatever airline they are on', () => {
  const closed = {
    kind: 'refurbishment',
    summary: 'Closed for refurbishment until October',
    starts_at: daysAgo(20),
    ends_at: new Date('2026-10-01T00:00:00Z').toISOString(),
    source_type: 'official',
  }
  const lounges = [withConditions(cathayFirst, closed), qantas]

  assert.equal(bestLounge({ ...david, airline: 'CX' }, lounges, now).lounge.name, 'Qantas London Lounge')
})

const queueing = {
  kind: 'capacity',
  summary: 'Queuing at peak, 20 minutes reported',
  starts_at: daysAgo(1),
  ends_at: null,
  source_type: 'member_report',
}

test('a queue is a warning, not a wall', () => {
  const lounges = [withConditions(cathayFirst, queueing)]
  const best = bestLounge({ ...david, airline: 'CX' }, lounges, now)

  assert.equal(best.lounge.name, 'Cathay Pacific First Class Lounge')
  assert.equal(best.blocked, null)
  assert.equal(best.busy.summary, 'Queuing at peak, 20 minutes reported')
})

test('being rammed loses a close call', () => {
  // Cathay First is the better lounge and normally the answer. Twenty
  // minutes of queue is enough to send a close rival ahead of it — but it
  // stays on the list, with the reason showing.
  const lounges = [withConditions(cathayFirst, queueing), qantas]
  const [first, second] = loungesFor({ ...david, airline: 'CX' }, lounges, now)

  assert.equal(first.lounge.name, 'Qantas London Lounge')
  assert.equal(second.lounge.name, 'Cathay Pacific First Class Lounge')
  assert.equal(second.busy.summary, 'Queuing at peak, 20 minutes reported')
})

test('being rammed does not lose a wide one', () => {
  // A thumb on the scale, not a demotion. A busy great lounge still beats a
  // quiet mediocre one, or a single grumpy report reshapes the terminal.
  const lounges = [withConditions(cathayFirst, queueing), americanGreenwich]
  assert.equal(
    bestLounge({ ...david, airline: 'CX' }, lounges, now).lounge.name,
    'Cathay Pacific First Class Lounge'
  )
})

test('conditions that have not started or have already ended are not in force', () => {
  const conditions = [
    { kind: 'closed', summary: 'Closing next month', starts_at: daysAgo(-30), source_type: 'official' },
    { kind: 'closed', summary: 'Was closed in June', starts_at: daysAgo(60), ends_at: daysAgo(30), source_type: 'official' },
    { kind: 'capacity', summary: 'Busy', starts_at: daysAgo(2), ends_at: daysAgo(-2), source_type: 'member_report' },
  ]
  const active = activeConditions(conditions, now)

  assert.deepEqual(active.map((c) => c.summary), ['Busy'])
})

test('conditions come back newest first, because the newest one is the news', () => {
  const conditions = [
    { kind: 'capacity', summary: 'Older', starts_at: daysAgo(9), source_type: 'member_report' },
    { kind: 'capacity', summary: 'Newer', starts_at: daysAgo(2), source_type: 'member_report' },
  ]
  assert.deepEqual(activeConditions(conditions, now).map((c) => c.summary), ['Newer', 'Older'])
})

// ---------------------------------------------------------------------------
// Access rules: generous about tier and cabin, strict about identity.
// ---------------------------------------------------------------------------

test('a rule asking for Sapphire is satisfied by an Emerald, but not the other way round', () => {
  const rule = { via: 'alliance_tier', alliance: 'oneworld', tier: 'sapphire' }
  assert.equal(admits(rule, david), true)
  assert.equal(
    admits(
      { via: 'alliance_tier', alliance: 'oneworld', tier: 'emerald' },
      { statuses: [{ alliance: 'oneworld', tier: 'sapphire' }] }
    ),
    false
  )
})

test('status in one alliance does not open another alliance"s door', () => {
  const rule = { via: 'alliance_tier', alliance: 'star', tier: 'gold' }
  assert.equal(admits(rule, david), false)
})

test('status is earned in the programme but spent on the flight', () => {
  // Emerald on an airline outside the alliance gets nothing free, which is
  // the rule people are most often surprised by at the door. Buying in is
  // still buying in — it just has to say so.
  const onEasyjet = { ...david, airline: 'U2', flightAlliance: null }
  const results = loungesFor(onEasyjet, [cathayFirst, qantas, americanGreenwich], now)

  assert.deepEqual(results.map((r) => r.lounge.name), ['Qantas London Lounge'])
  assert.equal(describeAccess(results[0].via), 'Paid entry, £65')
})

test('a first class ticket satisfies a business class rule', () => {
  const rule = { via: 'cabin', cabin: 'business' }
  assert.equal(admits(rule, { cabin: 'first' }), true)
  assert.equal(admits(rule, { cabin: 'premium economy' }), false)
  assert.equal(admits(rule, { cabin: 'Premium-Economy' }), false)
})

test('a cabin rule naming an airline means that airline', () => {
  const rule = { via: 'cabin', cabin: 'first', airline: 'CX' }
  assert.equal(admits(rule, { cabin: 'first', airline: 'CX' }), true)
  assert.equal(admits(rule, { cabin: 'first', airline: 'AY' }), false)
})

test('a programme rule means that programme, not something adjacent', () => {
  const rule = { via: 'programme', programme: 'Qantas Club' }
  assert.equal(admits(rule, { statuses: [{ programme: 'Qantas Club' }] }), true)
  assert.equal(admits(rule, { statuses: [{ programme: 'Qantas Frequent Flyer' }] }), false)
  assert.equal(admits(rule, david), false)
})

test('lounge networks and cards are held, not inferred', () => {
  const rule = { via: 'network', programme: 'Priority Pass' }
  assert.equal(admits(rule, { networks: [prestige] }), true)
  assert.equal(admits(rule, david), false)
  // A different network is a different lounge list, not a near enough.
  assert.equal(admits(rule, { networks: [{ network: 'LoungeKey', unlimited: true }] }), false)
  assert.equal(admits({ via: 'card', programme: 'Amex Platinum' }, { cards: ['Amex Platinum'] }), true)
  assert.equal(admits({ via: 'card', programme: 'Amex Platinum' }, { cards: ['Amex Gold'] }), false)
})

// ---------------------------------------------------------------------------
// Visit allowances. Getting in and getting in free are different questions.
// ---------------------------------------------------------------------------

test('an allowance counts down, and unknown is not the same as unlimited', () => {
  assert.equal(visitsLeft(prestige), null)
  assert.equal(visitsLeft(standardPlus(7)), 3)
  assert.equal(visitsLeft(standardPlus(10)), 0)
  assert.equal(visitsLeft(standardPlus(12)), 0) // over, not negative
  assert.equal(visitsLeft({ network: 'DragonPass' }), null)
  assert.equal(visitsLeft(null), null)
})

test('the card says how many visits are left, and says when they have run out', () => {
  const three = loungesFor({ networks: [standardPlus(7)] }, [plazaPremium], now)[0]
  assert.equal(describeAccess(three.via), 'Priority Pass, 3 visits left')
  assert.equal(three.cost, FREE)

  const one = loungesFor({ networks: [standardPlus(9)] }, [plazaPremium], now)[0]
  assert.equal(describeAccess(one.via), 'Priority Pass, 1 visit left')

  const none = loungesFor({ networks: [standardPlus(10)] }, [plazaPremium], now)[0]
  assert.equal(describeAccess(none.via), 'Priority Pass, £32 a visit — allowance used')
  assert.equal(none.cost, PER_VISIT)

  const unlimited = loungesFor({ networks: [prestige] }, [plazaPremium], now)[0]
  assert.equal(describeAccess(unlimited.via), 'Priority Pass')
})

test('a visit you have already paid for beats one you have not', () => {
  // Standard Plus with visits in hand: the network lounge is free today.
  // Once the ten are gone it costs £32, which still beats a £65 walk-in but
  // is no longer the automatic answer.
  const spent = { statuses: [], cabin: 'economy', networks: [standardPlus(10)] }
  const results = loungesFor(spent, [qantas, plazaPremium], now)

  assert.deepEqual(results.map((r) => r.cost), [PER_VISIT, WALK_IN])
  assert.equal(results[0].lounge.name, 'Plaza Premium Lounge')
})

test('an unknown kind of rule admits nobody', () => {
  assert.equal(admits({ via: 'vibes' }, david), false)
  assert.equal(admits(null, david), false)
})

// ---------------------------------------------------------------------------
// What the card says.
// ---------------------------------------------------------------------------

test('paying is an option but never the reason a lounge is recommended', () => {
  const noStatus = { statuses: [], cabin: 'economy', airline: 'AY' }
  const results = loungesFor(noStatus, t3, now)

  assert.deepEqual(results.map((r) => r.lounge.name), ['Qantas London Lounge', 'Plaza Premium Lounge'])
  assert.equal(describeAccess(results[0].via), 'Paid entry, £65')
  assert.equal(results[0].guests, 0)
})

test('a free route is what the card prints, even when paying is also on the list', () => {
  const withPass = { ...david, networks: [prestige] }
  const best = loungesFor(withPass, [plazaPremium], now)[0]

  assert.equal(describeAccess(best.via), 'Priority Pass')
})

test('a lounge you can walk into beats a better one you would have to buy', () => {
  // No status, but a Priority Pass. Qantas is the better lounge and ranks
  // higher, and sending him there to pay £65 is the wrong answer.
  const passHolder = { statuses: [], cabin: 'economy', networks: [prestige] }
  const results = loungesFor(passHolder, [qantas, plazaPremium], now)

  assert.deepEqual(results.map((r) => r.lounge.name), ['Plaza Premium Lounge', 'Qantas London Lounge'])
  assert.equal(bestLounge(passHolder, [qantas, plazaPremium], now).lounge.name, 'Plaza Premium Lounge')
})

test('when everything costs, the best paid lounge is still the answer', () => {
  const noone = { statuses: [], cabin: 'economy' }
  assert.equal(bestLounge(noone, [qantas, plazaPremium], now).lounge.name, 'Qantas London Lounge')
})

test('guests come from the best free route, not from the paid one', () => {
  const amex = { statuses: [], cards: ['Amex Platinum'] }
  assert.equal(loungesFor(amex, [plazaPremium], now)[0].guests, 1)
})

test('every way in can say what it is', () => {
  assert.equal(describeAccess({ via: 'alliance_tier', alliance: 'oneworld', tier: 'emerald' }), 'oneworld Emerald')
  assert.equal(describeAccess({ via: 'cabin', cabin: 'business' }), 'Business class')
  assert.equal(describeAccess({ via: 'programme', programme: 'Qantas Club' }), 'Qantas Club')
  assert.equal(describeAccess({ via: 'paid' }), 'Paid entry')
  assert.equal(describeAccess(null), null)
})

test('no lounges, or none you can get into, is an answer and not a crash', () => {
  assert.deepEqual(loungesFor(david, [], now), [])
  assert.deepEqual(loungesFor(), [])
  assert.equal(bestLounge(david, [], now), null)

  const allShut = [
    withConditions(cathayFirst, { kind: 'closed', summary: 'Closed', starts_at: daysAgo(1), source_type: 'official' }),
  ]
  assert.equal(bestLounge({ ...david, airline: 'CX' }, allShut, now), null)
})
