-- ============================================================
-- Private by default
--
-- Applied to production 2026-08-06. Nothing here deletes anything: every
-- trip, journal entry, photo, run and private note is exactly where it was.
-- This only changes who the database will show them to.
-- ============================================================

-- ── 1. The view that was ignoring every policy underneath it ──────────────
--
-- trip_meta is a view, and a Postgres view runs as its *owner* unless told
-- otherwise. It was never told otherwise, so it read the trips table as
-- postgres and handed back every row. Home reads trip_meta. Which means the
-- is_public flag, and the whole trip_is_visible policy beneath it, had no
-- effect on the trip list at all — signed out, signed in, anyone, everything.
--
-- This is the load-bearing line. Flipping is_public without it would have
-- changed nothing visible and looked like it had worked.
alter view public.trip_meta set (security_invoker = true);

-- ── 2. Private is the resting state ───────────────────────────────────────
--
-- Public is now the exception a trip is deliberately opted into, and only the
-- fictional Lisbon planning demo is. Membership is untouched:
-- trip_is_visible is (is_public OR is_trip_member), so the owner still sees
-- all seventeen and a shared traveller still sees the ones they are on.
update public.trips set is_public = (slug = 'demo-portugal');

-- ── 3. Rows that belong to no trip ────────────────────────────────────────
--
-- Every read policy carried the same escape hatch: "trip_id IS NULL OR
-- trip_is_visible(trip_id)". A row that belonged to no trip belonged to
-- everyone. On five of the six tables that was theoretical. On flights it was
-- 423 of 475 rows — the entire FR24 lifetime import, never assigned to a
-- trip: most of a lifetime of routes, dates, aircraft and registrations,
-- readable by anyone holding the anon key. Making the trips private did
-- nothing about it, because those rows were never gated on a trip.
--
-- They can't just be locked to trip membership: they have no trip, so that
-- would hide them from their owner too, and the Flights tab is most of the
-- app. Nor is "member of some trip" the right stand-in for "owns this row" —
-- that hands a shared traveller the whole lifetime log. Sharing a trip with
-- someone is not sharing your life with them.
--
-- The rows do have an owner. The schema just never said so, which is the
-- actual defect. So it says so now.
alter table public.flights add column if not exists owner_email text;

update public.flights
   set owner_email = 'david@moritznet.com'
 where trip_id is null and owner_email is null;

create index if not exists flights_owner_email_idx on public.flights (lower(owner_email));

drop policy if exists "read flights of visible trips" on public.flights;
create policy "read flights of visible trips" on public.flights for select using (
  (trip_id is not null and public.trip_is_visible(trip_id))
  or (
    trip_id is null
    and lower(coalesce(owner_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '@none'))
  )
);

-- The same hole, closed on the tables that have no trip-less rows today so
-- that they can't grow one quietly. is_known_traveller is kept because these
-- five have no owner column and no rows to need one; if that ever changes,
-- give them owner_email and the flights rule above.
create or replace function public.is_known_traveller()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from trip_members m
    where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', '@none'))
  )
$$;

do $$
declare
  tbl text;
  pol text;
begin
  foreach tbl in array array['photos', 'runs', 'journal_entries', 'costs', 'map_pins'] loop
    select policyname into pol
      from pg_policies
     where schemaname = 'public' and tablename = tbl and cmd = 'SELECT'
     limit 1;
    if pol is not null then
      execute format('drop policy %I on public.%I', pol, tbl);
      execute format($f$
        create policy %I on public.%I for select using (
          (trip_id is not null and public.trip_is_visible(trip_id))
          or (trip_id is null and public.is_known_traveller())
        )
      $f$, pol, tbl);
    end if;
  end loop;
end $$;

-- ── Verified against all three callers after applying ─────────────────────
--
--            trip_meta  trips  flights  journal  private_notes  photos  runs
--   anon             0      1        0        0              0       0     0
--   owner           14     17      475       99             18     504    68
--   shared           1      3        6        8              0       0     0
--
-- anon's single trips row is the public Lisbon demo, which is a draft and so
-- doesn't appear in trip_meta (that view is confirmed trips only) — it is
-- reached from the Plan tab, which is where a planning demo belongs.
