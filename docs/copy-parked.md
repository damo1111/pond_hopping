# Copy that is not in the app, and is not gone

Words that were written, worked, and were taken out of the place they were
in — because the moment was wrong, not because the writing was.

Kept here rather than in git history for one reason: **history is where
things go to not be found again.** A sentence nobody can grep for gets
rewritten from scratch, worse, eighteen months later.

Every entry says where it was, why it left, and where it might go.

---

## The intro cards, all three

Three cards on first launch, `src/components/IntroCards.jsx`, gated on
`pond:intro` and later on `ONCE.pitch`. Two came out early because first
launch is the one moment nobody has a question yet, and both of these are
answers. The third — **Tip it in** — held on alone for a while, and then
the cold open learned to say it, so the component and its flag are gone.

### Card one — "Tip it in"

> Photos from a trip you took. A Google Timeline export going back years. A
> booking you forward without reading. Whatever you already have — it works
> the trip out from there.

**Why it left.** Not because it was wrong. It was the only thing in the app
that said what the app was *for*, and it said it well. It left because a
card asks to be read and then dismissed, and nobody arrives wanting to read
— so the first thing a new hopper did was dismiss the only explanation they
were ever offered. Act two of the cold open now shows the same claim
happening: three photographs drop onto the globe, fold down onto the places
they were taken, and a line joins them into a trip. Then one sentence —
*Your photos already know where you went* — and the app.

**Where it might go.** The four examples are the valuable part and they are
too specific to waste. "A booking you forward without reading" belongs on
the forwarding screen; "a Google Timeline export going back years" belongs
beside the Timeline import, where somebody is already holding the file.

### Card two — "Watch it fill"

> Every flight becomes a line on the globe, and every day a map of where you
> actually went. Seventeen years of it, if you've got them.

**Why it left.** It describes an animation the app already performs. Read on
a card, before there is a single flight to draw, it is a promise; seen at the
moment the first flight draws itself onto the globe, it is the thing
happening. Showing beats telling and the app can already show it.

**Where it might go.** Beside the first flight arc a new hopper watches
appear. "Seventeen years of it, if you've got them" is the half worth
keeping — it is the sentence that makes somebody go and find their old
bookings.

### Card three — "Or don't"

> Everything is private until you decide otherwise. Then it's one link — to a
> trip, or to the lot — that you can take back whenever you like.

**Why it left.** It is the best sentence in the app about privacy and it is
answering a question nobody has asked forty seconds after installing. Nobody
worries about who can see a trip they have not made yet.

**Where it might go.** The Share tab, first visit. At the moment somebody
reaches for a link, this is the most reassuring paragraph we have, and "that
you can take back whenever you like" is the clause that closes it.

---

## The demo tour

`src/lib/demoTour.js`, three steps, gated on `pond:tourdone`. The tour goes;
one of its lines is too good to lose and has nowhere else to be said.

### Step one — "Someone else's pond" — **keep, and promote**

> A real trip, parked here so the place isn't empty when you turn up. Have a
> paddle round — it's properly finished, photos and all. Then it clears off.

**Why it survives.** It is the only thing in the app that explains why a
stranger's holiday is on your globe, and without it the example trip is
confusing rather than generous. It becomes a line on the trip itself instead
of step one of three behind an overlay.

### Step two — "Every hop, drawn"

> One line per flight you've taken. Four so far, and all of them borrowed.
> Yours will look better.

**Why it left.** The same promise as card two, told twice, ten seconds apart
— once in a card and once in a tooltip. **"Yours will look better" is the
good half** and deserves to survive somewhere.

### Step three — "Where to next?"

> Plan is where a trip starts — a date, a rough idea, a flight if you've
> booked one. Add one and the borrowed trip paddles off.

**Why it left.** Useful, in the wrong room. It belongs on the Plan tab's own
empty state, where somebody is standing when it is true and can act on it in
the same breath.

---

## The partner email

`src/components/Onboarding.jsx`, fired after sign-in and before the app on
`!profile.onboarded_at`.

> **Who do you travel with?**
> *placeholder:* them@example.com

**Why it left.** David, 12 August: "I have never seen the partner email so in
this case lose it." It is the one real question in the whole sequence and it
was being asked at the worst possible moment — before there is a trip, a
companion, or a reason.

**Where it goes.** The first time somebody uploads or plans a trip. That is
when there is a second person to name and, as David put it, a good
opportunity to onboard them too.

Note when it is rebuilt: it wrote both `profiles.partner_email` **and** a
`connections` row with `role: 'travel_companion'`. The second is the one the
sharing machinery actually reads.

---

## The routes sheet, five paragraphs and two buttons

`src/components/GetTripsIn.jsx`. Six routes, each with a title and a body of
two to three sentences — about 150 words — then a sign-up block and a way
out. Every route survives; the paragraphs do not, and neither do the buttons.

**Why they left.** Six things all asking to be read is the same as none of
them being read, and the paragraphs were writing a manual for somebody who
has been in the app for ninety seconds. Photographs — the only door that fits
a trip already taken, which is most of anyone's travel — were the second row
of a list. The sheet now leads with photos at the size of a decision, puts
"I'm on one right now" under it because it is the only route with a deadline,
and lets the other four stand on their names.

**The two buttons.** "Create an account" and "Have a look round first" were
the only calls to action on the screen, and one of them was *leave*. Signing
in already happens at the moment a signed-out hopper picks a route, attached
to the thing they chose, which is a better place to ask than the bottom of a
menu.

### "I'm off now"

> Nothing booked, nothing planned, leaving today. Starts a trip on the spot
> and lets the days fill themselves in — the one thing that can't be added
> afterwards.

**The good half.** *"the one thing that can't be added afterwards"* — the
whole argument for using the app today rather than next month, in eight
words. **Where it might go.** A nudge on a trip that has started and has no
entries yet.

### "Start from photos"

> A trip you've taken, or one you're on. I read the dates out of the photos
> and build the trip around them. Shrunk on your phone first, so it's quick.

**Why it left.** The middle sentence is now a drawing — a pile of snapshots,
an arrow, a route with pins — which says it faster and in no language.
"Shrunk on your phone first" is a reassurance about upload size that belongs
on the upload screen, where the reassurance is actually needed, and it is
already said there.

### "Bring your Google Timeline in"

> If Google has been keeping your timeline, every trip you've taken is already
> in it. Export it, drop the file here, and pick the ones worth keeping. It's
> read on your phone — nothing is sent until you've ticked them.

**Why it left, mostly.** The name is now plainly *Google Timeline* and keeps a
five-word hint, because it is the only route whose name does not say what it
does. **Where the rest goes:** it is on `StartFromTimeline` already, at the
step where somebody is being asked to export a file and wants to know what
happens to it.

### "Forward a booking"

> Send any confirmation — flight, hotel, restaurant — to this address and it
> turns into an itinerary. Forward a few old ones and your history builds
> itself.

**The good half.** *"Forward a few old ones and your history builds itself"* —
the only line that turns a one-off action into a habit. **Where it might go.**
The email that replies to the first forwarded booking.

### "Let your AI do it"

> Add Pond Hopping to Claude, ChatGPT or Gemini, then ask it to go through
> your inbox and add your trips. It already has your email — we never need it.

**The good half.** *"It already has your email — we never need it."* This is a
privacy claim most products cannot make and it is buried in row six of a
menu. **Where it might go.** Account, beside the connector URL, and any time
we are explaining what we do not hold.

---

# Copy that is being tested rather than chosen

Live variants are in `src/lib/variants.js` as data; this is the reasoning
behind them, and the ones not currently being served.

## The Home tile — `add_tile`

The only thing a new hopper can actually do, so what it says is the
highest-leverage sentence in the app. Five were drawn; two are being served.

| | title | strap | |
|---|---|---|---|
| — | Add a trip | One you've taken, or one you're on | *what it said before* |
| A | Where have you been? | Chuck in some photos and I'll work it out | parked |
| **B** | **Get your trips back** | Years of them, out of photos you already have — or start the next one | **serving** |
| **C** | **Tip it in** | Photos, a booking, whatever you've got | **serving** |
| D | Yours goes here | Photos in, trip out | parked |

**Why B and C.** B makes the strongest promise — *"back"* is the word doing
the work, because it says these trips already exist and you are missing
them. C is already the best line in the product and makes the tile and the
sheet it opens one thought instead of two. They are also the two furthest
apart in kind, which is what a two-arm test wants: a promise against a
phrase, not two rewordings of the same idea.

**Why B's strap grew a tail.** Every one of the five leans retrospective,
and **planning is a USP**. "Get your trips back" quietly tells somebody with
a holiday booked next month that this is not for them. "— or start the next
one" costs six words and keeps the door open. A test asserts at least one
arm speaks to a trip that has not happened yet, so a future edit cannot
quietly close it again.

**Parked, and why.**

- **A — Where have you been?** The most human of the five and the only
  question, which is hard to walk past. Held back because a question on a
  tile can read as a prompt rather than a button, and that is a real risk
  worth testing on its own rather than as a confound.
- **D — Yours goes here.** Uses the one thing the layout has that no copy can
  buy: it sits beside a finished example under a rail already labelled
  YOURS. Weak read on a page, possibly much stronger in place — which is
  exactly the thing a mockup cannot settle and a phone can.

## What to be careful of when reading the result

`enough()` in variants.js refuses to call anything until **200 shows per
arm**, and says "not yet" instead. At the current scale that is a long way
off. The mechanism is in early because assignment has to be decided before
events are written and an event with no variant on it can never be
re-analysed — not because an answer is close.
