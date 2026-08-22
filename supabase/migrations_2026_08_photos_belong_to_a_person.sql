-- A photograph belongs to a person, and only then to a trip.
--
-- Until now it belonged only to a trip, and ownership was read through it.
-- That works for every row that exists today and falls apart the moment one
-- does not have a trip — which is exactly what "no, keep them loose" would
-- have created. The read policy for an unattached photo was:
--
--     (trip_id IS NULL) AND is_known_traveller()
--
-- and is_known_traveller() asks only "is this email a member of any trip at
-- all". So an unattached photograph belonged to nobody and could be read,
-- edited or deleted by every signed-in member of any trip in the database.
-- Update and delete were worse: `trip_id IS NULL` passed on its own, with no
-- second condition at all. Insert was worst: anyone could create a row owned
-- by nobody.
--
-- Nothing had been hurt because nothing had ever created such a row. The
-- feature that would have created thousands is why this was fixed first.

alter table public.photos
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- Every existing photograph has a trip and every trip has an owner, so this
-- is total rather than best-effort. Checked before writing it: 3,137 rows,
-- none without a trip, none whose trip lacked an owner.
update public.photos p
   set owner_id = t.owner_id
  from public.trips t
 where t.id = p.trip_id
   and p.owner_id is null;

-- So an ordinary insert from the app carries it without every caller having
-- to remember. Server-side inserts run with no auth.uid() and must say who
-- the owner is themselves — see photo_import_store.
alter table public.photos
  alter column owner_id set default auth.uid();

create index if not exists photos_owner_idx on public.photos (owner_id);

-- ── The policies ─────────────────────────────────────────────────────────
--
-- Two ways to reach a photograph, and a loose one now has exactly one:
--
--   It is yours.
--   Or it is on a trip you can see / edit.
--
-- The second is unchanged and is what keeps shared trips and public examples
-- working. The first is new, and is what makes an unattached photograph
-- private to the person who took it rather than public to everybody.

drop policy if exists "read photos of visible trips" on public.photos;
create policy "read photos of visible trips" on public.photos
  for select using (
    owner_id = auth.uid()
    or (trip_id is not null and trip_is_visible(trip_id))
  );

drop policy if exists "insert photos as editor" on public.photos;
create policy "insert photos as editor" on public.photos
  for insert with check (
    owner_id = auth.uid()
    and (trip_id is null or is_trip_editor(trip_id))
  );

drop policy if exists "update photos as editor" on public.photos;
create policy "update photos as editor" on public.photos
  for update using (
    owner_id = auth.uid()
    or (trip_id is not null and is_trip_editor(trip_id))
  ) with check (
    owner_id = auth.uid()
    or (trip_id is not null and is_trip_editor(trip_id))
  );

drop policy if exists "delete photos as editor" on public.photos;
create policy "delete photos as editor" on public.photos
  for delete using (
    owner_id = auth.uid()
    or (trip_id is not null and is_trip_editor(trip_id))
  );
