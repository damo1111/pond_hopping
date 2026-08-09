import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DECAY_DAYS,
  activeConditions,
  admits,
  bestLounge,
  describeAccess,
  loungesFor,
} from './lounges.js'

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
    { via: 'priority_pass', guests: 0 },
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

test('a queue is a warning, not a wall', () => {
  const busy = {
    kind: 'capacity',
    summary: 'Queuing at peak, 20 minutes reported',
    starts_at: daysAgo(1),
    ends_at: null,
    source_type: 'member_report',
  }
  const lounges = [withConditions(cathayFirst, busy), qantas]
  const best = bestLounge({ ...david, airline: 'CX' }, lounges, now)

  assert.equal(best.lounge.name, 'Cathay Pacific First Class Lounge')
  assert.equal(best.blocked, null)
  assert.equal(best.conditions[0].summary, 'Queuing at peak, 20 minutes reported')
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

test('Priority Pass and cards are held, not inferred', () => {
  assert.equal(admits({ via: 'priority_pass' }, { priorityPass: true }), true)
  assert.equal(admits({ via: 'priority_pass' }, david), false)
  assert.equal(admits({ via: 'card', programme: 'Amex Platinum' }, { cards: ['Amex Platinum'] }), true)
  assert.equal(admits({ via: 'card', programme: 'Amex Platinum' }, { cards: ['Amex Gold'] }), false)
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
  const withPass = { ...david, priorityPass: true }
  const best = loungesFor(withPass, [plazaPremium], now)[0]

  assert.equal(describeAccess(best.via), 'Priority Pass')
})

test('a lounge you can walk into beats a better one you would have to buy', () => {
  // No status, but a Priority Pass. Qantas is the better lounge and ranks
  // higher, and sending him there to pay £65 is the wrong answer.
  const passHolder = { statuses: [], cabin: 'economy', priorityPass: true }
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
