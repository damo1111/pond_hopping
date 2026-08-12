-- The Flighty import wrote clock faces into columns that hold instants.
--
-- 307 flights had actual_dep_time and actual_arr_time stored as the naive
-- local clock at each airport, stamped as though it were UTC. BA546 into
-- Fiumicino claimed to have landed at 19:41 UTC when it landed at 18:41.
--
-- The same mistake as `a_local_clock_is_not_an_instant`, which fixed it for
-- flights_unfiled. The enrichment that wrote into `flights` was never given
-- the same treatment, and nothing linked the two: filed_flight_id was left
-- null, and flights_unfiled holds only the 400 rows that did *not* match, so
-- the source values for the 342 that did are not recoverable from it. The
-- repair therefore had to be done in place.
--
-- ── How the rows were told apart ──────────────────────────────────────
--
-- By provenance, checked against arithmetic. The conversion is applied only
-- where `enriched_from` mentions flighty, and the proof that this is the
-- right line is what happens to the rows on the other side of it.
--
-- Comparing actual block time against scheduled, before and after:
--
--   flighty                   245 rows   192 min out → 13
--   aerodatabox+flighty        52 rows   174 min out → 10
--   byair+flighty              15 rows   213 min out → 18
--   aerodatabox:none+flighty    1 row    107 min out → 13
--   aerodatabox                35 rows    40 min out → 166   ← untouched
--
-- That last line is the control group. AeroDataBox returns proper ISO with
-- an offset on it, so those rows were already right, and applying the
-- conversion to them makes them four times worse. It gets worse for exactly
-- the rows that should not be touched and better for exactly the rows that
-- should, which is a stronger argument than either half alone.
--
-- Rows are converted whole rather than only where the arithmetic improves,
-- because a flight between two airports in the same zone has a correct block
-- time and a wrong absolute one — nothing in the comparison can see it, and
-- it still needs fixing.
--
-- ── Safety ────────────────────────────────────────────────────────────
--
-- `flights_actual_backup` holds all 373 rows that had an actual time, as
-- they were, with the enriched_from that decided their fate. Reversing this
-- is one update.
--
-- ── Left alone deliberately ───────────────────────────────────────────
--
-- Twenty rows still differ from their schedule by more than 45 minutes:
-- nine of them are pure aerodatabox and were never part of this, and the
-- rest are most likely genuine — a real delay, a diversion, or a flight that
-- crossed midnight. They are not evidence of a systematic fault any more,
-- which is the whole point of doing this.

-- IATA to IANA, mirroring src/lib/airportTz.js. Kept as a table because the
-- conversion below needs it in SQL, and because `at time zone` wants a name
-- rather than a number so that daylight saving is handled for free.
create table if not exists public.airport_zones (
  code text primary key,
  zone text not null
);

-- The 97 airports in airportTz.js were inserted here at the time of the
-- repair. Add a code to both when a new airport turns up.

create table if not exists public.flights_actual_backup as
  select id, flight_number, dep_airport, arr_airport, enriched_from,
         actual_dep_time, actual_arr_time, now() as backed_up_at
  from public.flights
  where actual_dep_time is not null or actual_arr_time is not null;

-- `at time zone 'UTC'` takes the stored instant down to the naive clock face
-- that was really meant, and the second `at time zone` reads that face in the
-- place it was read off, which is the airport.
update public.flights f
set actual_dep_time = case
      when f.actual_dep_time is not null and zd.zone is not null
      then (f.actual_dep_time at time zone 'UTC') at time zone zd.zone
      else f.actual_dep_time end,
    actual_arr_time = case
      when f.actual_arr_time is not null and za.zone is not null
      then (f.actual_arr_time at time zone 'UTC') at time zone za.zone
      else f.actual_arr_time end
from public.airport_zones zd, public.airport_zones za
where zd.code = f.dep_airport
  and za.code = f.arr_airport
  and f.enriched_from like '%flighty%'
  and (f.actual_dep_time is not null or f.actual_arr_time is not null);

-- To undo:
--
--   update public.flights f
--   set actual_dep_time = b.actual_dep_time, actual_arr_time = b.actual_arr_time
--   from public.flights_actual_backup b where b.id = f.id;
