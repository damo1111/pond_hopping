# Backlog

Decisions taken and work queued, 11 August 2026. Written down because the
conversation they came from is very long and none of this should have to be
excavated from it later.

## Decided, not yet built

### Consent before photographs leave the app

The story reads every photograph and sends it to OpenAI. That is fine for
the person who asked for it and wrong for everybody else, and right now it
happens automatically on first upload with nobody asked.

- Asked **once**, at the first upload, in plain language: the pictures are
  read to work out where you went, and API data is not used for training.
- Changeable afterwards in Settings, including withdrawing it.
- Private notes are covered by the same consent, separately (below).

### The Photos tab, trimmed

Four things competed for attention on one screen. Decided:

- **Add photos** stays as it is.
- **The story** goes behind a disclosure — present, not shouting.
- **Find receipts** and **Find duplicates** go under one "tidy up this
  trip", because they are once-per-trip housekeeping.
- **Find bookings in email** leaves the photos tab altogether. It has
  nothing to do with photographs; it produces flights, hotels and costs, and
  belongs where its output lands.

### Choosing the cover, and the nine

`cover_photo_url` is null on most trips, so the hero is `photos[0]` — the
first row the query happened to return. Nobody chose it.

- Long-press or menu on any photograph → *make this the cover*.
- The star (`is_highlight`) already exists and the recap half-uses it.
  Make it the actual selector for the nine on the summary.

### Push, when a question is waiting

Not when the background pass finishes — that needs nothing from anybody and
the story simply improves on its own. A question is stuck until it is
answered, so that is the thing worth interrupting for. The enrichment
finishing deserves a quiet mark in the app, not a notification.

Kept to one place in the code, because this is the sort of decision that
gets reversed after living with it.

### Learning their voice: when to offer

Not a count of entries. The threshold is whether there is enough
*substantial* writing to imitate — `voiceFrom` already ignores anything
under forty characters, because "Explored the city" teaches nothing.

- Offer at **three entries of 200+ characters**.
- Offer it **just after they finish writing one**, while they are thinking
  about how they write, rather than burying it in Settings.
- Settings is where it is turned off, not where it is discovered.
- The rule that must not be lost: learning a voice changes vocabulary and
  rhythm, **never length**.

## Settled: the three tiers of writing

Asked whether "non-secret notes" should enrich the story, and the answer
clarified the model rather than changing it:

| tier | table | goes to the story |
|---|---|---|
| journal entries | `journal_entries` | **yes** — this is their public writing |
| shared notes | `private_notes`, `visibility = 'shared'` | no |
| private notes | `private_notes`, `visibility = 'private'` | never — these are the secrets |

So the answer to "should private notes enrich it" is no, and always was.
Journal entries already go over via `theirWords()` and are meant to be kept
verbatim. `private_notes` is read by one component and nothing else in the
app — not the story, not the showcase, not any endpoint — and that stays
true.

The thing that was actually broken was not what got sent but what got
honoured: a chapter opened "somewhere north of London, though I can no
longer say exactly where" when the entry said "Flew Edinburgh → London →
Rome". Fixed in #88 by framing their entry as testimony against the
photographs' evidence.

## Also queued

- **Settings needs a pass.** It is accreting switches with no structure, and
  three of the items above add more.
- **The four GPS tags `exif.js` never reads** — altitude, image direction,
  positioning error, subject distance. Bearing alone separates "at Piazza
  Navona" from "photographing the Fountain of the Four Rivers" with no
  vision call at all. Cannot retrofit what is already uploaded.
- **FlightAware AeroAPI** — see `docs/lounges.md`. Gives registration (which
  cascades into the aircraft photo), gate, actual times, delays. Never gives
  cabin or seat: those are ticket data and come from the booking email.
  Check history retention before assuming it backfills old trips.
  Flightradar24 on the flight card is a deep link, not a data source.
- **Cache the flight data in Supabase**, the same pattern as `place_lookups`
  and `photos.seen`, at two lifetimes. A registration's aircraft photograph
  never changes, so cache it for ever, once per tail number across every
  user. Gate and status cache briefly and are then updated by the alert
  webhook — the whole point of alerts is not re-querying.
- **One unexplained 405** on `/api/reconstruct-trip` in the Vercel logs.
- **The loop runs in the browser.** Navigate away and the reading of
  photographs stops — it resumes where it left off, because every
  photograph is saved as it lands, but it does not continue in the
  background. Moving it server-side is the real fix.
