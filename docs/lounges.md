# Lounges

The feature David wants Pond Hopping to be known for. Notes on why it is
shaped the way it is, written before any of it was built, because the data
model is the part that is expensive to change later.

## Why this isn't an API integration

There is no lounge API worth having. LoungeBuddy was bought by Amex and
closed; Priority Pass has none; nothing public maps *airport + terminal +
alliance + tier + cabin* to lounges, and nothing at all ranks them.

That absence is the opportunity. The useful sentence is not "here are the
lounges at LHR T3" — it is:

> Cathay First or the Qantas Lounge. Qantas if you want to eat properly,
> Cathay if you want quiet. Except this week Cathay are limiting entry to
> their own passengers, and you're on Finnair.

No API returns that. It comes from people who were standing there.

## Three kinds of fact, three lifetimes

The mistake would be one big `lounges` table. Access rules, live conditions
and insider tips have different lifetimes, different trust levels and
different update cadences, and mashing them together makes all three
unmaintainable.

### 1. Stable — where it is, who gets in

Changes a few times a year. Authoritative sources: the airline, the airport.

Access is modelled as **rules, not a flag**. The Qantas London Lounge is
reachable by oneworld Emerald, by Sapphire, by a business-class ticket, by
Qantas Club membership, and sometimes by paying — five independent routes to
one door. One row each, so eligibility is a filter and every answer can
explain itself: "You're in via oneworld Emerald, two guests."

### 2. Volatile — what is true this week

The Cathay example is the whole argument. During Middle East disruption
Cathay restricted the LHR First lounge to Cathay passengers only. An Emerald
on Finnair, told to go there, walks to the wrong end of a terminal and is
turned away. Nothing in the stable layer is wrong; the answer is still
useless.

So conditions are their own thing: closures, refurbishments, access
restrictions, capacity controls. Each with a start, an optional end, a
source, and a reporter.

**Conditions decay.** A restriction with no end date must not assert itself
forever — after a couple of weeks it should soften from "entry is limited"
to "was reported limited on 3 Aug". Stale certainty is worse than admitted
doubt, because people plan around it.

### 3. Subjective — what is actually good

"The Throne seats are the best seats in the Cathay First lounge." "Order
from the menu, don't queue at the buffet." This is the layer that makes the
product worth talking about and the layer no competitor has.

It is also the layer most likely to be wrong or out of date, so every tip
carries who said it and when. Note in passing: the Throne seats are most
associated with Cathay's Hong Kong lounges, and whether the LHR lounge has
them needs checking — which is exactly the point. The model must attribute
rather than assert, or the tips become folklore that nobody can correct.

## Where the data comes from

**Airports**: OurAirports, public domain, complete. Free.

**Lounges, stable layer**: hand-curated. The top ~200 airports cover almost
all premium travel; fifty done properly beats five thousand scraped.

**Conditions and tips**: the interesting problem. Three routes, in
increasing order of value:

- **Published sources** — Head for Points, One Mile at a Time, FlyerTalk,
  Reddit, airline announcements. A periodic job drafts candidate rows from a
  curated source list; a human approves. Never auto-publish: social is
  unreliable, and a wrong "you can't get in" is worse than saying nothing.

- **Travellers already in the app** — the strongest source, and the one
  nobody else can build. After a flight departs from an airport with
  lounges, one question: "Did you use a lounge at LHR T3?" Which one, and
  anything worth knowing. That is how the Cathay restriction gets caught the
  day it starts, and it is asked at the only moment anyone would answer it.

- **A correction control on the lounge card itself.** You notice the hours
  changed while standing in reception. Feeds a review queue.

## What it has to say out loud

Every fact shows its provenance, because the trust model *is* the product:

- "Cathay say" — official
- "Reported by 3 travellers this week" — crowd
- "Your note" — theirs

An answer that cannot say where it came from should not be shown.

## Lounge networks are not a boolean

Priority Pass, LoungeKey, Mastercard Airport Experiences and DragonPass are
separate networks with separate lounge lists. One `priorityPass: true` flag
across all of them produces confidently wrong answers at the door, which is
the one thing this feature cannot afford.

Nor is membership one thing. Priority Pass **Standard** includes no visits
and charges around £32 each; **Standard Plus** includes ten and then charges;
**Prestige** is unlimited. "You can get in" is true for all three and useless
for two of them. So every way in carries a cost — free, per-visit, or walk-in
— and answers are ordered by it: a visit already paid for beats a per-visit
charge, which beats a £110 walk-in. The card says which, and how many are
left.

Unknown is not unlimited. A membership with no recorded allowance says
nothing about visits rather than implying they are free.

### And the crowding

The most common way a network lounge goes wrong is that it is full, and it is
the one thing the networks themselves will never tell you. A capacity report
is a warning rather than a wall — you are still allowed in — but it puts a
thumb on the scale: enough to lose a close call, not enough to demote a great
lounge below a poor one on one grumpy report. It is never hidden.

This is also the part that makes a partnership worth having and worth being
careful about. Ranking and conditions stay editorially independent. An honest
"the network lounge here is the crowded one, go elsewhere" is the reason
anyone would trust the rest of it.

## Status capture

Never a form. One question at the moment it pays off: the first BA flight
imported asks about Executive Club and oneworld, and never asks again.
Others can be added later from Account, unprompted. Hotels follow the same
path on the first hotel booking.

Stored as a list — programme, alliance, tier — because people hold several,
and alliance plus tier is what eligibility actually needs. The programme
name is only there to make the question feel like it knows you.

## Flight status, related

Push notifications for gates and delays want **FlightAware AeroAPI with
Alerts** rather than polling: register an alert per flight when the booking
is imported, receive a webhook when something changes. Seconds rather than
minutes, no scheduler, and cost that scales with travellers rather than with
patience. Verify gate coverage at CMB, MEL and SYD before committing —
Cirium is the escalation if it is thin, at the price of an enterprise
contract.
