# What is queued

Written down because a list held in a conversation is a list that gets lost.
Roughly in the order it is worth doing, not in the order it was asked for.

---

## 1. The story pipeline runs server-side, and pushes when it is done

**Half done.** Everything except the reading of the photographs now runs in
`api/build-story.js`, which finishes whether or not the tab is open.

What moved: build the trace, reconstruct, file the questions, write, save.
It fetches its own evidence rather than being handed whatever a browser
happened to have loaded, and it acts as the person who asked — their token,
their row-level security, no service key. `story_runs` records that a run is
in progress, so a double tap gets a 409 rather than two runs racing to write
the same story and the loser's version winning. A claim that goes quiet for
a quarter of an hour is taken over, because a crashed invocation must not
lock a trip for ever. The screen polls that row, so coming back to the app
mid-run shows progress instead of quietly starting a second one.

It also fixed something nobody had noticed. `TripStory` returned null
without photographs, so six trips imported from a Google Timeline — 4,217
recorded positions, 212 stays, a journal entry on nearly every day, not one
picture — had no story and no button anywhere in the app that could give
them one. They were not failing. They were unreachable.

**What is left.**

- **The seeing.** Reading three hundred photographs does not fit in one
  300-second invocation, so it is still in the tab, and a big first upload
  still wants the app left open. This is the queue-of-small-steps part, and
  it is the whole of the remaining work.
- **The push.** One when the questions are ready, one when it finishes.
  A line or two now: there is a server side to send it from, and
  `story_runs.finished_at` is the moment to send it.

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
departure is in the future and picks them up once it is past. What is
missing is anything that *runs* it on a schedule, which is the same missing
piece as the story pipeline: there is no server-side loop. These two want
building together.

Until then the pass can run when the flights screen opens, which covers the
backfill and everything historical, and leaves upcoming flights to be
enriched the next time somebody opens the app after landing. That is not
"without being asked", but it is close enough to be worth having.

## 7. Flight data: AeroAPI

Decided but not committed to. **Standard tier, $100/month minimum**, which
is a floor rather than a subscription on top of usage — per-query fees draw
down against it, and the volume here does not come close.

Personal is not an option: no historical data, no alerts, and personal or
academic use only. History reaches back to 2011, which removes the need for
a second provider. Standard permits storage and distribution for
business-to-consumer purposes, which covers caching in Supabase.

See `docs/lounges.md`.

---

## Smaller things

- **`ios/RELEASE_UNLOCKED` comes off main** once the iOS build has landed,
  or the next merge cuts another store build.
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
