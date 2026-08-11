# What is queued

Written down because a list held in a conversation is a list that gets lost.
Roughly in the order it is worth doing, not in the order it was asked for.

---

## 1. The story pipeline runs server-side, and pushes when it is done

**Agreed. The next thing to build.**

Today the whole pipeline — read the photographs, reconstruct the trip, ask
the questions, write it — runs in the browser tab. Moving around inside the
app is fine, because the requests are already in flight and the save lands
whether or not the component is still mounted. Backgrounding the app or
locking the phone is not: the JavaScript is suspended and the run dies with
it.

Nothing is lost that was already saved — a photograph that has been read is
marked read and never gets paid for twice — but the story does not finish
writing, and there is no way to know that except by coming back and finding
it unchanged.

This has bitten twice in one evening, which is what moves it to the top.

What it needs:

- the loop moved behind an endpoint that runs to completion on its own
- somewhere to record that a run is in progress, so two do not start
- a push when it finishes, and a push when the questions are ready — the
  latter was asked for explicitly and is one line once there is a server
  side to send it from
- the screen reads state rather than driving it, so opening the app
  mid-run shows progress rather than starting a second one

The 300-second Vercel limit is the constraint worth designing around: a
trip of 286 photographs does not fit in one invocation, so this wants to be
a queue of small steps rather than one long call.

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
