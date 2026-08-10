# The story of a trip

Decided 11 August 2026, after David fed the raw Rome EXIF to ChatGPT and got
back something far better than this app produced from the same 286
photographs. This records what we are building and, more usefully, why each
rule is the shape it is. Most of them exist because of a specific failure.

## What went wrong first

The app spent months building apparatus to keep coordinates *away* from the
model — Foursquare lookups, candidate shortlists, `CLOSE_M`,
`CLEARLY_NEARER`, `TRUST_PHOTO`, `STAYED_MINUTES`, a centroid per segment —
on the assumption that a model could not be trusted with a latitude and
longitude. Foursquare returned "La Cenatio Rotunda" for the Colosseum and
"Obelisco Agonalis" for Piazza Navona. Handed the raw coordinate, a model
says "the northern part of the Roman Forum archaeological zone".

The venue database was worse than the world knowledge it replaced. Delete
the apparatus; send the trace.

## Three stages, never one

`see-photos` → `reconstruct-trip` → `write-trip`.

A single call asked to be forensic *and* literary does neither. It either
hedges the prose into "you appear to have been stationary for approximately
fifty-two minutes", or it lets the writing decide what happened, which is
how a coherent itinerary gets manufactured out of a four-hour gap.
Establishing what happened and saying it well pull against each other.

Splitting them also means the expensive part — looking at every photograph —
is paid once. The evidence is kept, and a different output (a map, a photo
book, a shorter version, a rewrite in another voice) costs one cheap call
rather than 286 image calls.

## The invention line

Both positions were in David's own brief. The prompt he supplied says **DO
NOT CREATE FALSE MEMORIES**. The narrative he called "really nice" opens
with *"Warm light on old stone. Scooters. Narrow streets."* — none of which
is in the EXIF.

The line he chose, and it is a good one:

- **Texture: yes.** What was near-certainly true of that place, at that
  hour, in that season. January dawn light. Shutters down in Trastevere at
  seven. Scooters in Rome.
- **Events: no.** Never a specific meal, venue, purchase, encounter or
  activity that the photographs do not show.
- **Uncertainty: said out loud.** The best passage in the whole narrative is
  *"Maybe dinner. Maybe a drink. Maybe simply somewhere warm to sit."* An
  admitted gap reads more like a person than a confident invention, and it
  is also true.

## Macro events, and the question mechanism

David asked for public events that touched the trip — an airline IT outage,
a strike, a heatwave — to be usable. The corroboration he assumed ("you'd
know from flight data") does not exist: `flights` carries one `dep_time` and
one `arr_time`, with no scheduled-versus-actual, so nothing in the database
knows a flight was disrupted. That is the FlightAware AeroAPI work in
`docs/lounges.md`, still blocked.

So, his answer, and it is the best idea in the design:

- By default a public event may only **set the scene**, never be given as a
  cause.
- Where the trip's own record fuzzily matches — an arrival much later than
  the route's usual block time, an unplanned night in an airport city, a
  travel-day gap that nothing explains — the reconstruction does not assert
  it and does not drop it. **It asks the hopper.**
- A confirmed answer becomes evidence and can be written as fact. A denial
  is remembered too, so nobody is asked twice.

This is the thing the app can do that a chat window cannot: come back and
ask. It generalises past outages — any plausible-but-unverifiable link
should become a question rather than a guess. Dated-event recall is exactly
where models confabulate, and a trip taken after the training cutoff will
have events invented for it with total confidence.

## Voice

ChatGPT told David it did not have enough of his writing to imitate him. The
app has 99 entries. But his entries are terse — *"Explored the city, then a
pasta-making course with dinner in the evening."* — and the narrative he
liked is expansive and reflective. Imitating him naively collapses three
pages into one line.

- The narrator voice is the default, for everybody.
- A hopper may **consent** to their own writing being learned from, after
  which the voice moves toward theirs.
- **Never shrink content.** Learning a voice adjusts vocabulary and rhythm.
  It never adjusts length. Length follows the day, always.

## Shape

The story is its own artefact, not a set of journal entries:

    opening reflection
    a chapter per day
    a closing essay

It lives beside the hopper's own entries and never replaces them — the same
rule as the `blend` column, for the same reason. Their words are not ours to
overwrite.

## What the numbers are for

`tripTrace` computes these in code, exactly, so nothing has to infer them:

- every photograph in order, five decimals, no centroid — the path *is* the
  movement, and averaging a cluster to one dot destroys exactly that
- photographs that kept a time and lost their fix — two of those mid-travel-day
  are somebody on an aeroplane
- the gaps, named and unfilled
- distance on foot, with hops faster than 15 km/h dropped. Summed naively,
  Rome's day one is 1,982 km; capped at 30 km a hop it is still 24, because
  two Scottish photographs are 23 km apart three minutes apart.

Day two comes to 14.3 km and day three to 12.7, against ChatGPT's 14.5 and
12.8. The difference is the hops this excludes, and this is the more honest
number.

## Cost

Wide, deliberately. Quality first, optimise later.

Worth knowing: output dominates. A forty-field schema across 286
photographs is over a hundred thousand output tokens, and output costs
several times input — which makes the 34,810 input tokens of the cheap pass
beside the point. Every field asked for is paid for twice. That is why the
extraction schema is short.

## Things that do not work, so nobody tries them again

- **A vision model cannot read EXIF.** The API decodes the image and sends
  pixels. Asking for aperture, bearing or camera model returns invented or
  null fields, one set per image. It is a code job.
- **This app strips EXIF at upload anyway.** `photoResize` re-encodes
  through a canvas, on purpose, so no uploaded file carries GPS. The
  originals on the phone still do.
- **Perceptual hashing does not group burst shots.** 286 Rome photographs
  group to 285. The hash catches a stylised re-export of the same file;
  twenty-three shots of the same colonnade from slightly different angles
  are not that. Grouping is temporal, and it happens after the looking.
- **Per-batch moment clustering is wasted.** A batch of twenty does not know
  the trip. `tripTrace` already has the segments, the gaps and the distances
  exactly.

## Still outstanding

- The four GPS tags `src/lib/exif.js` never reads: altitude, image
  direction, positioning error, subject distance. Bearing alone would settle
  "at Piazza Navona" versus "photographing the Fountain of the Four Rivers"
  without a vision call. Reading them is a small change to the same IFD walk
  — it cannot retrofit the 286 already uploaded, but every future upload
  would carry it.
- FlightAware AeroAPI, for scheduled-versus-actual. Everything about macro
  events gets stronger the day it lands.

## Measured against the target

The bar is the narrative in David's export, not "better than before". Six
places the prompt would have fallen short of it, found by reading the two
side by side rather than by running anything:

1. **Person.** The target is first person throughout — "I stayed for a
   while". The prompt did not say, and the stage it replaced said second
   person. A journal in the second person is a report about somebody.

2. **Rhythm.** Much of why the target reads well is the variation: a long
   observant sentence, then "It doesn't." on its own line. Nothing in the
   prompt asked for it, and a prompt that does not ask for rhythm gets even,
   unbroken paragraphs. Now asked for, with a warning not to make it the
   only move.

3. **Thinking, not only reporting.** "Travel can easily become a strange
   exercise in efficiency if you let it." The old rules forbade
   editorialising outright, which bans the thing that separates a journal
   from an itinerary. Now allowed, one or two a chapter, never as a moral.

4. **Threads inside the days.** "Piazza Venezia ended up becoming something
   of a compass point for the whole trip" appears in the *middle of day two*,
   at the moment a reader would notice it too. The reconstruction gathers
   patterns and recurring places; nothing told the writer to weave them
   through rather than save them for the end. A trip written as independent
   days is the most common way this comes out flat.

5. **Length, with a number.** "Length follows the day" is not an
   instruction, it is a hope. The target's Tuesday is about 1,100 words.
   Without a figure the output is 250 and reads as a summary. Now: eight
   hundred to twelve hundred for a dense day, two or three hundred for a
   travel day, and under-writing named as the worse failure.

6. **The opening is not about the trip.** It starts general — "There are
   some trips that feel long because so much happens" — and arrives at Rome.
   Described as "a short reflection" it would have come out as a summary of
   the itinerary.

None of these needed an API call to find. Reading the target against the
instruction is the cheapest quality check available and it should happen
before every run, not after.
