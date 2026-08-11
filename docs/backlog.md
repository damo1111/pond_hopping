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
