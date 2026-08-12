# What is queued

Written down because a list held in a conversation is a list that gets lost.
Roughly in the order it is worth doing, not in the order it was asked for.

---

## 1. The story pipeline runs server-side, and pushes when it is done

**Done, and proven with a real run rather than assumed.**

`api/build-story.js` is now only a door: it decides whether somebody may
write this trip — their token, their row-level security, `is_trip_editor()`
— claims the run, and answers 202 in milliseconds. Everything after that is
`api/story-step.js`, which pg_cron pokes through pg_net once a minute until
the trip is written. One batch of ten photographs a tick, each written down
as it comes back, then reconstruct, ask, write, save, push.

No service key anywhere in it. The worker holds the shared secret Vercel
already had as `PUSH_SECRET` and reaches the database through seven
functions that each take that secret and a single trip id. Authorisation
happens once, by a person, at the door.

It also fixed something nobody had noticed. `TripStory` returned null
without photographs, so six trips imported from a Google Timeline — 4,217
recorded positions, 212 stays, a journal entry on nearly every day, not one
picture — had no story and no button anywhere in the app that could give
them one. They were not failing. They were unreachable.

**What the first real run showed.** The Voyage, claimed 10:49:23, finished
10:52:25, `ok = true`, three chapters and 3,891 characters from testimony,
flights, one run and fifteen recorded stays — no photographs at all. The
push landed on an iPhone. Every link is now evidence rather than inference.

**Two things worth writing down.**

- **`vercel.json` is where the worker's time limit lives**, and it was
  missing. The seeing would have looked fine and the writing would have
  timed out every time, with cron retrying the most expensive call in the
  app every two minutes. `reconstruct-trip.js` and `write-trip.js` having
  their own 300 does not help: story-step imports their functions and runs
  them under its own limit. Anything new that calls a model needs its own
  entry.
- **`net._http_response` records `status_code: null`** for a poke, because
  pg_net gives up waiting long before a three-minute invocation returns.
  That is fire-and-forget working as intended, and it means the only record
  of a failed tick is `story_runs.note`. Do not add a check that reads the
  pg_net response and concludes anything from it.

**Still not exercised.** The seeing has never run under the worker — the
trip that proved the pipeline had no photographs. The next upload is its
first real test. The high-detail second pass over frames with legible text
is not wired into the worker at all; the low pass covers every trip today.

---

## 1b. Deducing the leg from the trace

**The library exists and is proven against the real archive. Nothing in the
app calls it yet.** `src/lib/legs.js` and `src/lib/deduce.js`.

A leg is a journey between two places on somebody else's timetable, and the
shape is the same for a Eurostar and a 787 — only the mode differs. So a
node is somewhere a service leaves from, a part is the bit of it you stood
in, and an airport and a station are one object with a different `kind`.
Built that way from the first line rather than retrofitted, which is the
only reason trains work at all.

**What it does.** A hole in the trace nobody crossed on the ground is a
leg. It merges consecutive fast segments so two window photographs are one
flight rather than three. It names Heathrow Terminal 5 from a geotag. It
returns a ranked list with reasons, and — the part that matters — the
question to put to a timetable: mode, both ends as *lists*, and a window.

**What it will not do.** Never returns `confirmed`. A photograph is
inference, and inference does not get to sit on the same rung as testimony.

### What the sweep over the real archive settled

Run over China & Japan and both NZ status runs, against the recorded
flights. Not two hand-picked days — the whole trips.

- **NZ: 7 of 7 crossings found**, all four recorded flights matched, and
  all four narrowed to exactly one service — including two identical
  SYD–WLG and two identical WLG–BNE a week apart. That is the hopper case.
- **China: 4 of 6** correctly identified, including the train.
- **Four flights found that are not in the database at all** — MEL–BNE on
  21 May, MEL–SYD twice on the status runs, BNE–MEL on 24 June. Positioning
  legs, the same gap the Rome BA1433/BA1446 pair turned out to be.

**The two things it got wrong, and both were the same mistake.** A bound
correct in principle that threw away real flights:

- **A recorded stay at an airport outlasts the aeroplane**, because it ends
  when the *phone* leaves the airport's footprint and the phone is on the
  aeroplane. Wellington on 17 June has them inside the airport twenty-five
  minutes after QF282 pushed back. Rejecting on that bound discarded the
  right flight for being real. Now `GRACE_MINUTES`, and only for stays — a
  *photograph* in a terminal at 12:40 does rule out the 12:10.
- **A scheduled arrival is not an arrival.** QF163 lands at 23:55 and the
  Timeline has them at the hotel at 00:05.

**What it cannot do, and should not pretend to.** Hong Kong to Guangzhou is
107 km in two hours — 52 km/h. That is a real CX982, and from position
alone it is indistinguishable from a coach or the ferry. Anything under the
road ceiling is invisible to this, permanently.

**A trace that contradicts itself is named, not smoothed.** Guangzhou to
Shanghai comes out at 1,399 km/h because a Timeline visit is recorded as
ending four hours after the aeroplane landed. Above `IMPOSSIBLE_KMH` the
route is still reported and the certainty drops to `unknown`.

**Still to do.** Nothing calls it. It wants: a screen that offers what it
found, the timetable lookup behind `ask` (AeroDataBox by route and date
already exists; rail has no equivalent yet), and writing accepted legs
back. Trains have no `flights` table to go in — see item 3 below.

---

## 1c. ~~`actual_dep_time` and `actual_arr_time` are wrong~~ — done

**Fixed. 307 rows repaired on 12 August**, backed up in
`flights_actual_backup`, and reversible with one update. See
`migrations_2026_08_a_clock_is_not_an_instant_for_flights_either.sql`.

The Flighty import wrote naive local clock times into `timestamptz` columns,
so every leg crossing a timezone had actual times out by the offset. BA546
into Fiumicino claimed to have landed at 19:41 UTC; it landed at 18:41,
nine minutes after schedule. DL2521 into New Orleans now reads two minutes
late instead of six hours early.

**What decided which rows to touch** was provenance, and what proved the
line was right was the control group. Average disagreement with the
scheduled block time, before → after: `flighty` 192 → 13, `aerodatabox+
flighty` 174 → 10, `byair+flighty` 213 → 18. And `aerodatabox` alone, left
untouched, would have gone 40 → 166 — it gets worse for exactly the rows
that should not be touched, which is a stronger argument than either half
on its own.

Twenty rows still differ from schedule by more than 45 minutes, nine of them
pure aerodatabox. Those look like real delays rather than a systematic
fault, which was the point.

The evidence is the shape of it. Comparing actual block time against
scheduled, the differences cluster on **whole hours** — 42 legs at 0, then
piles at −8, −5, −1, +1, +2, +5, +8. Delays do not do that. Zone offsets do.

*This item first claimed, as its illustration, that BA546 "landed at 19:41
UTC and the next photograph is in the middle of Rome five minutes later".
That was not a sound argument and the correction is item 1e: photograph
times are not reliably UTC either, so the two sides of it were never
comparable. The whole-hour clustering above is the actual evidence and it
stands on its own.*

- 208 of 245 `flighty`, 44 of 52 `aerodatabox+flighty`, 10 of 15
  `byair+flighty`, 1 of 1 — 263 legs, plus 9 of 35 pure `aerodatabox`
  which are a separate question and may be genuine delays.
- **It is recoverable.** `flights_unfiled` kept the naive local values in
  purpose-built columns and the raw row beside them, and `AIRPORT_TZ` turns
  a local clock and an airport into an instant.

This matters beyond tidiness: narrowing a leg to one service compares
instants. Until it is fixed, every disagreement it finds on a
zone-crossing flight is the import's fault rather than the airline's.

---

## 1d. Knowing what people do, and when it breaks

**Half built. The capture layer is done; the coverage is not.**

The app white-screened on every load for hours on 11 August and the way
anybody found out was a screenshot. The error boundary did its job and then
wrote the reason to a console on somebody else's phone. There was no record
that it had happened, to how many people, on which build, or since when.

And the usage log was three events — the app opening, a tab, a trip — which
answers "is anybody using it" and nothing else. It could not say where
somebody gave up in onboarding, whether an upload finished, or how long a
story took.

**What exists now.**

- `app_events` gains `user_id` and `build`. Every event carries which shell
  it came from and which tab it happened on.
- `app_errors`, written only through `note_error()` and read only through
  `what_is_broken()`. **No RLS policies at all** — no direct insert, no
  direct select, from any key. Deduplicated on
  `(session, kind, build, message)` with a count, so a render loop is one
  row saying 400 rather than 400 rows. A new build is a new row on purpose.
- `oops()` goes out as a **bare fetch to PostgREST**, no client library
  underneath it, because a crash report is produced at the moment the app is
  least able to do anything — supabase-js may be what broke.
- `window.onerror`, `unhandledrejection`, failed asset loads, and
  `Boundary.componentDidCatch` with the component stack.
- `callApi()` — every one of our own endpoints, with failures recorded and
  timings on the ones that call a model.
- A **What is broken** card in Account, admin-only, loud for the running
  build and quiet for history.
- Events queue in `sessionStorage` when offline and flush on reconnect,
  carrying their real time. This is an app for people on aeroplanes.

**What is instrumented.** Boot (with time-to-first-render and shell), sign
in as three separate steps, onboarding through to done, trip creation from
photographs and from a Timeline, uploads start-to-finish with counts and
duration, story failures, API failures, crashes.

**What is not, and should be.** Journal writing, the planner, sharing, the
demo tour, flight triage, the photo grid, the install prompt, asking for
push permission, and the moment a signed-out visitor hits the "this trip
isn't yours" wall — which is the single most interesting event in the app
and is currently invisible.

**The next real step is a notification, not a screen.** A card in Account
only helps somebody who thinks to open it. `pg_cron` already ticks and the
push endpoint already exists: a job that fires once when a *new* fault
appears on the *current* build would have turned six hours of downtime into
six minutes. Once per fault per build, or it becomes noise and gets muted.

---

## 1e. `photos.taken_at` is sometimes an instant and sometimes a clock

**The same trap, a third time, and this one is worse because it is mixed.**

`exif.js` reads `DateTimeOriginal`, which is a bare local clock, and
`OffsetTimeOriginal`, which is the zone the camera believed it was in. Then:

```js
takenAt: takenLocal ? `${takenLocal}${tzOffset ?? 'Z'}` : null
```

With the offset tag, `taken_at` is a true instant. Without it, the local
clock is stamped `Z` — a naive clock pretending to be UTC. **And the offset
is parsed and then thrown away**: `photos` has `taken_at` and `taken_on` and
nowhere to put it, so nothing records which kind any given row is.

**Proven, not suspected.** DL2521 landed at New Orleans at 04:16 UTC on 5
March 2024. The first photograph in the French Quarter is stored at 23:04 on
4 March — five hours before the aeroplane landed, if that were an instant.
As a local clock it is forty-eight minutes after landing, which is exactly
right.

**Why it is not simply "add the offset back".** The offset tag is the
*phone's* belief about where it is; the coordinate is where the person
actually was. Those disagree exactly when a phone has not yet picked up the
local network — which is the arrival photograph, every time, which is the
one the deduction most wants. On 22 January 2024 the Rome arrival reads
19:46 against an aeroplane on stand at 19:41 Rome time; on London time it is
20:46, an hour after landing, which is the only reading that is physically
possible.

So there are three sources and they must not be silently merged:

  the offset tag       what the camera thought — best when present
  the coordinate       where they really were, via `zoneAt()` in legs.js
  the sequence         a phone changing zone mid-trip leaves a visible jump

**What to do.** Add `tz_offset` and `tz_from` to `photos`; keep the offset
when EXIF has it; derive from the coordinate when it does not; and where the
two disagree, **keep the disagreement** rather than settling it — the same
rule `enrichment()` already follows for flights. Originals are still held
for photographs uploaded with `keepOriginals`, so some of this is
recoverable by re-reading rather than guessing.

Until then, every instant the deduction reads from a photograph may be an
hour or nine hours out, and it has no way to know.

---

## 2. Re-ordering photographs

**For marketing. There is no way to do this today.**

Both grids are chronological and nothing else: the album is ordered by
`taken_on`, and the recap takes the chosen ones and reads them in date
order. The only control anybody has over what a trip looks like is *which*
pictures appear — `★ always show` and `✕ never show` — never in what order.

For showing the app to somebody that is the wrong way round. The first
three pictures of a trip decide whether anybody looks at the fourth, and
the best three are rarely the earliest three.

What it needs:

- a `position` column on `photos`, null by default, meaning "no opinion"
- readers that sort by `position` first and fall back to the date, so a
  trip nobody has arranged still reads as a day going past
- drag to re-order in the album grid, and separately among the twelve on
  the recap — they are two different questions and want two answers
- the rotation in `recapPhotos.js` has to respect it: a fixed order and a
  rotating window need reconciling, and probably the answer is that
  arranging the twelve turns the rotation off, because somebody who has
  arranged them has said what they want

Worth doing properly rather than as a hidden long-press.

---

## 3. "Make demo" should duplicate, not convert

The switch in Account flips `is_demo` on the trip itself, which turns your
real trip into the example — same rows, same photographs, same journal
entries with your life in them. That is why the Rome example had to be
built by hand.

It should copy: the trip, its photographs, flights, runs and entries into a
new trip, mark the copy, leave the original alone.

The part that cannot be automatic is the part that took longest by hand —
deciding what a stranger should see. A machine can copy 286 photographs; it
cannot know that "Called Matt" should not go. So the honest shape is:
duplicate mechanically, with the same filters used for Rome (nothing the
seeing pass associated with a person, an even spread through each day),
then hand over the copy to edit before it goes public.

---

## 4. An aircraft on the flight arc

The dashed line from LHR to FCO could carry the operating airline's tail,
moving along it. For a flight already flown that is an animation on a loop;
for one happening now it is a real position, which is what the flight API
is for.

Small, and the kind of detail people show other people.

---

## 5. The refusal should be an invitation

A signed-out visitor can tap everything on the example trip and nothing
happens — which is the sandbox that was wanted, and it costs nothing to
maintain because it is simply row-level security doing its job.

What they get told is "this trip isn't yours to edit", which is true and a
door in the face. It should say that signing in makes it theirs, with the
button there.

---

## 6. Anonymous uploads to the storage bucket

`storage.objects` has `public upload photos` with no auth check, so anybody
signed out can write files into the bucket. The `photos` row insert is
refused, so nothing appears in the app — but the bytes stay.

Not urgent. It is an open door.

---

## 6b. Every flight gets enriched, once, without being asked

The rule: a flight that arrives in this app — typed in, imported from an
email, pulled off a boarding pass — gets whatever a flight source knows
about it, automatically. Nobody should have to press anything.

`flightEnrich.js` already holds the half that does not depend on the source:
which fields may be filled, that recorded values are never overwritten, that
disagreements are kept rather than settled, and `worthAsking()` — has a
number, has a departure time, has not been enriched before.

**The hole in the rule as stated.** "Whenever a flight is added" is not
enough, because half of them are added *before* they happen. A booking
imported in March for a flight in September has no registration, no gate, no
actual times and no track, because none of those exist yet. Asking at the
moment it is added gets a schedule, which is what we already had.

So it is two moments, not one:

  on add        for anything already flown — the backfill case, and any
                historical flight somebody enters afterwards
  after it flies  for everything else, which needs something to come back
                and look a day or so later

`worthAsking()` already answers both correctly — it skips flights whose
departure is in the future and picks them up once it is past. What was
missing was anything that *ran* it on a schedule.

**That part now exists.** pg_cron ticks every minute and pg_net pokes an
endpoint; `tick_story_runs()` is the working example, and the secret-gated
`SECURITY DEFINER` pattern beside it is how a worker reaches the database
without a service key. A `tick_flight_enrichment()` on the same shape is a
short job rather than an architecture — hourly rather than by the minute,
since a flight that landed an hour ago is soon enough.

Two things to get right when it is written, both learned the hard way:

- **a source's reach.** Pass `reach` so a source is never asked about dates
  it has said it cannot see. Asking anyway cost 369 pointless requests and,
  worse, wrote every refusal down as an answer.
- **its own `vercel.json` entry.** Anything that calls a model or loops over
  hundreds of rows needs a `maxDuration`, or it dies on the default and cron
  retries it for ever.

## 7. Flight data: three sources, and which reaches what

**AeroDataBox** — live, free, and the only one working today. 365 days on
every tier it sells, which is 113 of 482 flights here. `REACH.aerodatabox`
is that limit, and `worthAsking()` uses it so the other 369 cost nothing
rather than 369 refusals.

**Cirium** (Flex APIs) — the adapter is built and the account is live. It
is the only source that plausibly reaches October 2009, which is where this
archive starts. **The mapping has still not been confirmed against a real
answer**: `?peek=1` tries both plausible historical paths and reports which
one answered, and there is a button in Account. Do not let it near 369
flights until that has been run.

  Two variables, both on every request: `CIRIUM_API_KEY` and
  `CIRIUM_APP_ID`. The app id identifies you and the key must not be
  committed, so neither is in the source and the endpoint says which one is
  missing by name.

  **The trap.** Vercel injects environment variables at build time. Adding
  one in the dashboard does nothing to a deployment that has already been
  built — the endpoint kept reporting `CIRIUM_APP_ID is missing` for a
  variable that was plainly there. It needs a redeploy, and a push to main
  is one.

**AeroAPI** — the fallback if Cirium disappoints. Standard tier, $100/month
minimum, which is a floor rather than a subscription on top of usage.
Personal is not an option: no historical data, and personal or academic use
only. History reaches 2011, so it would leave the four flights from 2009
and 2010 unreachable by anything. Standard permits storage and
distribution, which covers caching in Supabase.

See `docs/lounges.md`.

---

## Smaller things

- ~~**`ios/RELEASE_UNLOCKED` comes off main**~~ — done. Build 116 reached
  App Store Connect on 11 August and the file came out in the same day's
  work. Store builds are off again until somebody creates it and says why:
  `touch ios/RELEASE_UNLOCKED && git add -f ios/RELEASE_UNLOCKED`.
- **The example trip rewrites itself** when photographs are added, which
  overwrote a hand-written story once already. A guard skipping the
  auto-rerun on demo trips would keep an approved version approved.
- **Settings needs a structural pass** — it has grown by accretion.
- **Voice learning** should be offered at three entries of 200+ characters,
  right after writing one, rather than sitting in Settings unasked for.
- **Consent** before photographs go to OpenAI, with re-consent available.
- **Four unread GPS EXIF tags**: altitude, bearing, positioning error,
  subject distance.
- **`gmail-scan.js` is still on `gpt-5.5`**, a generation behind everything
  else.
- **One unexplained 405** on `/api/reconstruct-trip`, seen once.
