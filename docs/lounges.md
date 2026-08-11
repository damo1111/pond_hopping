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

### Nobody knows they have one

The largest source of lounge access is not lounge memberships. It is bank
accounts. Revolut, NatWest Reward Platinum, Barclays Premier, HSBC Premier,
the Amex Platinum and a dozen packaged current accounts all bundle Priority
Pass, LoungeKey or DragonPass — and a great many people paying for one have
no idea, because it was a bullet point on a page they read once when they
opened the account.

So the question is never "do you have Priority Pass", which most people
answer no to correctly and unhelpfully. It is **"do you bank with any of
these?"** — a short list of the accounts that carry lounge access in the
markets we are in — and the app works out the rest: which network, and how
many visits, because those follow from the plan rather than from anything
the traveller has to know.

That also fixes the allowance problem this section opens with. Asking
somebody their Priority Pass tier is asking them to look up a thing they
have never looked at. Asking which Revolut plan they are on is a question
they can answer instantly, and it determines the tier exactly.

Backlogged rather than built: it needs a maintained table of accounts to
benefits, per market, and a wrong entry here would tell somebody they can
get in when they cannot. The same rule as the rest of this file — better to
say nothing than to say something confidently wrong at a door.

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

## Flight data: which API, and why

Decided 11 August 2026. Revisited because the first version of this section
recorded one option as though it were the only one, and Flightradar24 had to
be argued back into the room twice from memory. That is what this document
exists to prevent, so this time the alternatives are written down with it.

### The choice

**FlightAware AeroAPI**, self-serve, one key.

The finding that settled it: **Flighty runs on FlightAware Firehose**.
Firehose and AeroAPI are the same underlying data — the difference is
delivery and contract. Firehose is a persistent stream on an enterprise
deal; AeroAPI is pay-per-query with **Alerts**, a webhook when something
about a registered flight changes.

So the question was never FlightAware versus Flightradar24. It was which
door into FlightAware, and whether anything else is cheaper for history.

AeroAPI gives, on a self-serve account: gate, scheduled versus actual,
delays, cancellations, diversions, aircraft type and **registration** —
which is the field that cascades, because the aircraft photograph is a
lookup keyed on the tail number.

### What it does not give, ever

**Cabin, seat, fare, booking reference.** These are ticket data, not flight
data. No flight API knows which seat somebody sat in. They come from the
booking confirmation email, which `gmail-scan` and `extractBookingItems`
already read.

Getting this wrong sent one conversation down a blind alley: the blank
fields on a flight card are not all the same kind of blank.

### The alternatives, and why not

**Flightradar24 API.** History back to 2016, self-serve, credits from around
$9 a month, lookup by registration, callsign or airport pair. Genuinely
strong on retro, and cheaper than AeroAPI's historical query class is likely
to be. Kept as the fallback for **backfill only**: if AeroAPI's historical
pricing is steep for the forty-odd flights already in the log, add FR24 for
those and leave everything live on AeroAPI. The `flightradar24.com` link on
the flight card is a deep link for a human, not a data source.

**FlightAware Firehose.** What Flighty uses. Best in class and an
enterprise contract. Not worth it to draw level with a competitor on the one
screen where they are strongest.

**Cirium.** The escalation if gate coverage turns out thin. Enterprise
pricing.

### To check before committing

- **Gate coverage at CMB, MEL and SYD.** Unchanged from the original note.
- **The cost of a historical query**, for about forty flights, each looked
  up once and cached for ever. This is the single number that decides
  whether FR24 is needed at all.

### Caching

Same pattern as `place_lookups` and `photos.seen`, at two lifetimes.

A registration's aircraft photograph **never changes** — cache it for ever,
once per tail number, shared across every user. Gate and status cache
briefly and are then updated by the alert webhook; the entire point of
alerts is not re-querying.

### On beating Flighty

Not at live flight tracking, and it is not worth trying. They have a
streaming enterprise feed and years of polish on exactly that screen.

The flight card here should be excellent and unremarkable — gate, delay,
registration, aircraft, seat, all correct. The advantage is everything
around it. Flighty knows a flight was late. This knows the four-hour gap
that followed, has the photographs of what came next, and comes back and
asks what happened in it. A flight tracker's data model ends at the gate.
