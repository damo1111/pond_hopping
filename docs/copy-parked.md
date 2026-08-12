# Copy that is not in the app, and is not gone

Words that were written, worked, and were taken out of the place they were
in — because the moment was wrong, not because the writing was.

Kept here rather than in git history for one reason: **history is where
things go to not be found again.** A sentence nobody can grep for gets
rewritten from scratch, worse, eighteen months later.

Every entry says where it was, why it left, and where it might go.

---

## The intro cards, two of three

Three cards on first launch, `src/components/IntroCards.jsx`, gated on
`pond:intro`. Card one — **Tip it in** — stays. These two came out because
first launch is the one moment nobody has a question yet, and both of these
are answers.

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
