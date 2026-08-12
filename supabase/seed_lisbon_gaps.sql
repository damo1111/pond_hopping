-- Gaps in the Portugal demo, so the Concierge has something to find.
--
-- David's brief, 12 August: "on the lisbon demo i wanted a few empty
-- legs/nights to show off that feature". It had never been done — all six
-- nights were covered, so the Concierge opened on a finished trip and had
-- nothing to say. Worse, one of the six was a row titled "Suggested hotel —
-- InterContinental Porto": a Concierge suggestion, stored as a real booking,
-- filling the one night that might have demonstrated the point.
--
-- On legs: computeCoverage() classifies *nights* only — stay, transit or
-- gap. There is no such thing as a missing leg as far as the Concierge is
-- concerned, so leaving one out would demonstrate nothing. If empty legs
-- should be a thing it finds, that is a feature, not a seed.
--
-- What this leaves, verified by running computeCoverage() over it:
--
--   9, 10 Oct  Baixa House, Lisbon
--   11, 12 Oct — nothing booked · Sintra, Belém, two dinners as evidence
--   13 Oct     Torel Avantgarde, Porto
--   14 Oct     — nothing booked · Douro valley, dinner at Cantina 32
--
-- Two gaps rather than one, and of different lengths, because the merging of
-- consecutive nights is itself part of what is being shown off. Three of six
-- nights booked: enough that it reads as a real trip somebody is midway
-- through planning, rather than an empty week.

create table if not exists public.demo_portugal_before_gaps as
select *, now() as kept_at from public.planned_events
where trip_id = 'f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3';
alter table public.demo_portugal_before_gaps enable row level security;

-- Two nights come off the Lisbon booking. Checkout moves from the 13th to
-- the 11th, which leaves the 11th and 12th unbooked.
update public.planned_events
   set end_date = '2026-10-11'
 where trip_id = 'f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3'
   and kind = 'hotel' and title like '%Baixa House%';

-- And the Concierge's own suggestion goes, so it has something to suggest.
delete from public.planned_events
 where trip_id = 'f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3'
   and kind = 'hotel' and title like 'Suggested hotel%';
