-- The example trip is always five days out.
--
-- ── The problem with a date ───────────────────────────────────────────────
--
-- Lisbon & Porto was seeded starting 9 October 2026 and has been ageing ever
-- since. Written in August it read "IN 55 DAYS", which is the vaguest thing
-- the card can say — far enough away that nothing on it is urgent, near
-- enough that it isn't aspirational either. Left alone it would eventually
-- read "Already been", and the one example built to demonstrate *planning*
-- would be demonstrating history, which the other two examples already do.
--
-- A demo trip with a fixed date is a demo trip with a shelf life. Every
-- tester who arrives sees a different distance, and none of them sees the
-- one the trip was designed for.
--
-- ── Why five ─────────────────────────────────────────────────────────────
--
-- countdown() in planLane.js has buckets, and they are not equally good:
--
--   0        Today
--   1        Tomorrow
--   2–6      In N days      ← concrete, imminent, the strongest line there is
--   7–13     Next week      ← vague
--   14+      In N days
--
-- Six would be the maximum inside the strong bucket, but the stored date is
-- one date and the readers are in every timezone there is. This runs on UTC,
-- so somebody in Los Angeles is reading it while their local date is still
-- yesterday's and somebody in Auckland while theirs is already tomorrow's:
-- the same row reads one day further out to the west and one day nearer to
-- the east. Five puts the whole spread — four, five, six — inside 2–6, so
-- the card never says "Next week" and never says "Tomorrow" to anybody.
--
-- It also leaves the trip's own shape intact. Five days out with six nights
-- of itinerary means three of six nights booked, two gaps for the Concierge
-- to find (see seed_lisbon_gaps.sql), and a countdown with heat on it. Close
-- enough to be packing for, far enough that the holes still read as a to-do
-- list rather than a disaster.
--
-- ── What moves ───────────────────────────────────────────────────────────
--
-- The whole trip, by whole days, together. Dates that slide independently
-- would be worse than dates that go stale: a hotel that no longer covers the
-- night it was booked for, a flight on a day the trip does not include.
-- Three tables carry every date this trip has — trips, planned_events,
-- flights — verified against the schema rather than assumed; costs, map_pins,
-- day_weather and day_tracks hold nothing for it.
--
-- ── What it will not touch ───────────────────────────────────────────────
--
-- Anything real. The example is chosen by `is_demo AND status = 'draft'`,
-- which is one row and says what it means: the demo that is meant to be
-- ahead of you. Rome and China & Japan are confirmed and are meant to be
-- behind you, so they keep their own dates and their own jobs. Nothing here
-- can reach a trip somebody actually took — the same property that matters
-- in demoFlightClock.js, and for the same reason.

create or replace function public.keep_the_example_ahead(days_out integer default 5)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  example public.trips%rowtype;
  slide integer;
begin
  -- One row: the example trip that is still to come. Ordered and limited
  -- rather than trusting there to be exactly one, because a second draft
  -- example someday should move the nearer one, not fail.
  select * into example
    from public.trips
   where is_demo and status = 'draft' and start_date is not null
   order by start_date
   limit 1;

  if not found then
    return 0;
  end if;

  slide := (current_date + days_out) - example.start_date;

  -- Already where it should be. Twenty-three of the twenty-four hourly runs
  -- end here, which is the point: the job is a correction, not a rewrite.
  if slide = 0 then
    return 0;
  end if;

  -- is_demo repeated in the WHERE clause and not only in the SELECT above.
  -- The id came from a guarded read a few lines earlier and that is almost
  -- certainly enough; "almost certainly" is not the standard for a statement
  -- that rewrites dates on a trips row.
  update public.trips
     set start_date = start_date + slide,
         end_date   = end_date + slide
   where id = example.id
     and is_demo;

  update public.planned_events
     set event_date = event_date + slide,
         end_date   = end_date + slide
   where trip_id = example.id;

  -- Whole days, so a 07:55 departure stays a 07:55 departure. The actuals
  -- move with the schedule rather than being dropped: this trip has not
  -- happened, so they are null, and null + interval is null.
  update public.flights
     set dep_time        = dep_time + make_interval(days => slide),
         arr_time        = arr_time + make_interval(days => slide),
         actual_dep_time = actual_dep_time + make_interval(days => slide),
         actual_arr_time = actual_arr_time + make_interval(days => slide)
   where trip_id = example.id;

  return slide;
end
$$;

-- Nobody signed in has any business calling this. It runs as the job owner
-- and rewrites shared rows; an authenticated caller could otherwise shove
-- the example around for everybody by passing days_out.
revoke all on function public.keep_the_example_ahead(integer) from public;
revoke all on function public.keep_the_example_ahead(integer) from anon;
revoke all on function public.keep_the_example_ahead(integer) from authenticated;

-- Hourly, not daily. The value only changes when the UTC date rolls over, so
-- twenty-three runs a day do nothing at all — but a daily job that fails
-- once leaves the example a day wrong for twenty-four hours, and this is the
-- first thing a new hopper sees. Hourly makes it self-healing.
select cron.schedule('example-stays-ahead', '7 * * * *', $$select public.keep_the_example_ahead()$$);

-- And now, rather than up to an hour from now.
select public.keep_the_example_ahead();
