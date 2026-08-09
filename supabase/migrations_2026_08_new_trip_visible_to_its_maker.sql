-- A new trip was invisible to the person who had just made it.
--
-- "Start the trip" failed with `new row violates row-level security policy
-- for table "trips"`. The insert itself was always fine. RETURNING is a
-- read, and reads went through trip_is_visible(id): are you a member of this
-- trip. You are made a member by claim_new_trip, which is an AFTER INSERT
-- trigger — so at the moment RETURNING is evaluated, the membership row does
-- not exist yet. The trip was a fraction of a millisecond too young to
-- belong to anybody, and every route into the app asks for the id back
-- because it needs somewhere to put the flights.
--
-- Two things were wrong, and only fixing both works.

-- 1. Nothing on the row said who made it. owner_id had been sitting here
--    doing nothing, null on all seventeen rows. A column default is applied
--    as part of the insert rather than after it, so the row can answer for
--    itself before anything asks.
alter table trips alter column owner_id set default auth.uid();

update trips t
set owner_id = u.id
from trip_members m
join auth.users u on lower(u.email) = lower(m.email)
where m.trip_id = t.id and m.role = 'owner' and t.owner_id is null;

-- 2. The policy asked by looking the trip up, and a lookup cannot see it.
--    trip_is_visible is STABLE, so it reads the snapshot the statement began
--    with, which does not contain the row that statement is inserting. No
--    default could have helped while the question was asked that way.
--
--    A policy on trips does not need a lookup: it is handed the row. Read
--    the columns directly and the answer is there immediately, RETURNING
--    included. is_trip_member stays for everyone who is not the owner — it
--    queries a different table, which the snapshot does contain.
drop policy if exists "read visible trips" on trips;
create policy "read visible trips" on trips
  for select using (
    is_public
    or owner_id = auth.uid()
    or public.is_trip_member(id)
  );

-- Editing and deleting have the same shape and the same gap.
drop policy if exists "edit open or editor trips" on trips;
create policy "edit open or editor trips" on trips
  for update using (
    owner_id = auth.uid() or (not trip_is_private(id)) or is_trip_editor(id)
  ) with check (
    owner_id = auth.uid() or (not trip_is_private(id)) or is_trip_editor(id)
  );

drop policy if exists "delete open or editor trips" on trips;
create policy "delete open or editor trips" on trips
  for delete using (
    owner_id = auth.uid() or (not trip_is_private(id)) or is_trip_editor(id)
  );

-- Child tables ask through this one, so it learns the same trick. They are
-- not affected by the snapshot problem — their rows are inserted after the
-- trip exists — but an owner should not depend on the membership row having
-- caught up.
create or replace function public.trip_is_visible(t uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from trips
    where id = t and (is_public or owner_id = auth.uid())
  ) or public.is_trip_member(t)
$$;
