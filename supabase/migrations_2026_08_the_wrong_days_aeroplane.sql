-- Seventeen flights enriched from the wrong day.
--
-- `on: String(f.dep_time).slice(0, 10)` took the first ten characters of a
-- timestamptz — the date in UTC. Every flight source keys its schedules on
-- the local date at the departure airport, because that is the date on the
-- boarding pass. Those agree for most of the world most of the time and
-- disagree for exactly the flights this app is full of.
--
-- MH146 leaves Melbourne 08:45 on 3 April, which is 21:45Z on the 2nd. We
-- asked for the 2nd and were correctly given the aeroplane that left
-- Melbourne on the 2nd. Nothing errored. It was written down as the actual
-- departure of a flight taken on the 3rd, and Thailand began a day early.
--
-- The tell is a 24-hour "delay", which is not a delay — it is a
-- cancellation and a rebooking. Twenty-four rows across seven trips.
--
-- askAbout() in flightEnrich.js fixes the question; believable() refuses the
-- answer if a future source gets it wrong anyway. This is the data.

-- Kept whole, not just the timing columns: the wrong day also supplied the
-- gate, the terminal and the registration, and those are just as wrong.
drop table if exists public.flights_wrong_day_backup;
create table public.flights_wrong_day_backup as
select f.*, now() as kept_at
from public.flights f
where (f.actual_dep_time is not null
       and abs(extract(epoch from (f.actual_dep_time - f.dep_time))) > 6*3600)
   or (f.actual_arr_time is not null and f.arr_time is not null
       and abs(extract(epoch from (f.actual_arr_time - f.arr_time))) > 6*3600);

alter table public.flights_wrong_day_backup enable row level security;

comment on table public.flights_wrong_day_backup is
  'Flights enriched from the wrong day before askAbout() existed. Reversible.';

update public.flights f
   set actual_dep_time = null,
       actual_arr_time = null,
       gate_dep = null, gate_arr = null,
       terminal_dep = null, terminal_arr = null,
       registration = null,
       aircraft_model = null,
       call_sign = null,
       track = null,
       disagreed = null,
       -- Cleared so worthAsking() offers them again, and they are asked with
       -- the local departure date this time. Blanking without this would
       -- leave them permanently unenriched, which is a worse end state than
       -- the bug.
       enriched_at = null,
       enriched_from = null
  from public.flights_wrong_day_backup b
 where f.id = b.id;
