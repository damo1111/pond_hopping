# Photos, and the journal that writes itself

The pitch is "no effort". You come home, the trip is already written down.
Nothing in the app does that yet, and this is the shape it should take,
written before any of it is built — the same way `docs/lounges.md` went,
because the mistakes in here are the expensive kind and most of them are
about other people's words.

## What exists, honestly

Worth being exact, because three conversations have assumed more than is
true.

- **EXIF is read, on the phone, before upload.** Dates and coordinates.
  It works: New Orleans arrived with 313 of 323 photos dated and 305
  located.
- **`Start from photos` already builds a trip from dates.** Pick photos,
  it reads them and makes a trip around what it finds.
- **The trip summary is generated.** One paragraph, OpenAI, cached in
  `trip_summaries`.

And what does not:

- **No image is ever looked at.** OpenAI is used four times in this app and
  every one is text — booking emails, the Gmail scan, plan chat, the
  summary. There is no vision call anywhere.
- **No journal entry has ever been generated.** Every one was written by
  hand or seeded.
- **The upload path is not the smart path.** `Start from photos` reads
  dates and builds a trip; the Photos tab uploader ignores all of that and
  puts them on whichever trip happened to be selected. Same capability, two
  doors, only one of them wired up.

So the chain the pitch depends on is:

```
EXIF  →  analysis  →  a generator  →  the journal
 ✓         ✗              ✗              hand-written
```

Two of the four are missing. Adding photos with perfect metadata improves
day maps, groups photos onto days, and puts pins on the map. **It does not
write a word**, and it will not until something is built that does.

## 1. Photos find their own trip

The uploader should answer "which trip is this?" itself.

On selection, before anything is sent: read the dates, cluster them, and
compare each cluster against the trips that already exist.

- **Inside a trip's dates** → that trip. Say which, don't ask.
- **No trip covers it** → offer to make one, dates already filled in.
- **Two trips could** → ask, with both named. Overlapping trips are rare
  and guessing between them is worse than a question.

Say it before the upload, not after: *"40 of these look like Rome, 12–19
January. 6 are from March and don't match anything."* Which is also the
answer to a real hazard — with 200 photos going to the wrong trip and no
bulk undo, a wrong guess is expensive to unpick.

## 2. Two speeds, and saying so

Location is instant: it comes off the phone with the file. Analysis is not
— call it a second or two per photo, so a couple of minutes for a real
trip's worth, and it costs money per image rather than per trip.

That difference has to be visible or it reads as broken. The upload should
finish by telling you what it already knows and what is still coming, and
the trip should fill in while you watch rather than after a wait with a
spinner on it. What it must not do is claim the journal is ready before
the analysis has landed, then quietly rewrite it underneath somebody.

## 3. What analysis is actually for

Not captions. A caption on every photo is noise nobody reads.

It is for the handful of things that turn coordinates into a sentence: what
kind of place this is, whether there are people in it, whether it is worth
showing. "A photo at 41.89, 12.49" becomes "the Colosseum, mid-afternoon,
the two of you in it" — and the second one can be written about.

It also answers a question the app already needs and cannot ask: **which
photos have you in them.** That is the difference between an example trip
that can be shown to strangers and one that cannot, and it came up the
first evening the example existed.

## 4. The generator, and the rule that protects people

A day has: photos with times and places, flights, logged stops, costs, and
anything already written. From that, a paragraph per day.

The rule that matters more than the prose:

> **Never overwrite a word somebody wrote.**

Generated text and written text are different things and must be stored as
different things. A regeneration replaces the generated half and leaves the
written half exactly where it was. Get this wrong once, silently, on
somebody's honeymoon, and there is no repair and no forgiveness — it is the
single most dangerous thing in this document, and it is why it is being
written down before anything is built.

Which implies, concretely: a `source` on each entry, or separate columns
for the generated draft and the person's own text. Not one `note` field
that both write into.

Regeneration happens when the material changes — photos added, a booking
imported, places logged — and it is cheap to redo, so it can be automatic.
The written half never regenerates, ever.

## 5. Editing by saying what you want

Not a form. *"Delete the bit on day 5 about the car."* *"Add the lunch at
Billy's on Monday."*

Same shape as the plan chat that already exists, and the right one: a form
makes you find the entry, open it, and edit around the sentence you dislike.
A sentence describes the change and the app finds it.

Two constraints. It shows what it will do before it does it, because "the
bit about the car" can match two things. And an edit made this way becomes
**written** text, not generated — you said it, so nothing may overwrite it
later.

## 6. Sharing outward

A shared trip is read by people with no account and no intention of getting
one, and that is the point rather than a leak in the funnel: it is how
anybody hears about this app at all. The link already needs no sign-in.

Two gaps: there is no way to make a trip public from inside the app, and
the share button will hand out a link to a private trip that shows the
recipient nothing. The second is fixed. The first needs a control that says
plainly what becomes visible — journal, photos, costs — and is as easy to
undo as to do.

## Order

1. **Photos find their own trip.** Uses what already exists, removes the
   worst foot-gun, no new cost.
2. **The generator**, with the written/generated split from the first
   commit. This is the poster feature.
3. **Editing by instruction.** Cheap once 2 exists and its storage is right.
4. **Analysis.** Makes 2 much better, is not required for it, and is the
   only part with a per-photo bill.

Analysis last is deliberate. A journal built from dates, places, flights
and stops is already worth having; one that waits for vision to be wired up
is worth nothing until then.

## Three views of a day, and whose words they are

David, 10 Aug: "how about we give the Hopper control — they see the
generated view after their declared view (if they entered anything) or they
can toggle and see an AI blended view? Model trained using their tone of
voice. It will learn as they enter more text how they speak and write."

A day can be told three ways, and the hopper picks:

1. **Theirs.** What they wrote. The default whenever it exists, and never
   touched by anything.
2. **The places.** What the photographs say — stops, names, times, how long.
   Arithmetic and a maps lookup; no opinions.
3. **Blended.** The two woven together, in their voice. A view, offered.

The reason this shape matters is not the toggle, it is what the toggle makes
impossible. An earlier design had the machine writing into the same field
the person wrote in, protected by a rule that it must not overwrite them.
Rules like that hold until they don't. Three views cannot overwrite anybody,
because the first one is the only place a person's words are kept and
nothing else writes there.

**The blend is a view, never a record.** It is regenerated from the other
two whenever either changes, and nothing edits it directly. The moment a
blend becomes the stored thing people edit, somebody's writing is one
paraphrase away from gone.

### Voice: prompted, not trained

Not a fine-tune. Their own entries go into the prompt as examples. This is
free, works from the first entry, improves with every one they write, and
can be read and revoked — none of which is true of a trained variant, which
would also need a training run and a hosted model per person to arrive at a
worse version of the same thing.

Two parts, and they do different jobs:

- **Examples**, sampled at generation time from their recent and longest
  entries. Always current, no storage, no staleness.
- **A distilled note** — "short sentences, no adjectives, names places
  rather than feelings" — kept per person, shown to them, and editable.
  Cheaper per call than shipping six full entries, and it turns "how we
  think you write" into something a person can correct rather than
  something that happens to them.

### The rule that keeps it honest

**Verbatim, or not at all.** A model asked to weave prose around facts will
sand the prose down: "guested into the Concorde Room and got chatting to a
Scottish couple heading to South Africa" comes back as "enjoyed lounge
access at Heathrow before departure". Their sentence, gone. So the blend
keeps their sentences word for word and weaves place detail around them,
and their original is always one tap away.

**And below a handful of entries there is no voice to imitate.** Offering a
blended view to somebody who has written two lines produces a parody of a
person. Under the threshold the blend is not offered, and the screen says
why rather than serving a bad impression of somebody to themselves.
