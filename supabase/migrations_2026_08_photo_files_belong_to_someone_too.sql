-- Photo *files* belong to someone too.
--
-- The rows were fixed first — photos.owner_id, and four policies that make a
-- photograph readable by the person who took it and nobody else. The files in
-- the bucket were still governed by the policies written before any of that
-- existed, and they had two holes in them.
--
-- 1. Delete was `bucket_id = 'photos'` for any authenticated user. No trip
--    check, no ownership check, nothing. Anybody with an account could delete
--    every photograph in the bucket. The row would survive and every one of
--    them would render as a broken image, which is a worse kind of gone than
--    gone.
--
-- 2. `originals/` was an unconditional exception on all three verbs. It was
--    written that way for an honest reason — a queued original belongs to no
--    trip, so scoping to the trip would have refused every one of them — but
--    "belongs to no trip" is not "belongs to nobody". The file is named after
--    its photos row, and that row now says who owns it, so the question can
--    finally be asked properly.
--
-- 3. And the new one: `loose/<uid>/` for photographs kept without a trip at
--    all. Same path-segment trick the trip policies use, one level along.

-- Does this originals/<photo id>.<ext> file belong to whoever is asking?
--
-- Invoker rights on purpose. The photos table's own policies already let
-- somebody see their own rows, so this needs no elevation — and a definer
-- function reading a table by a string pulled out of a file path is exactly
-- the sort of thing that turns into a way to read other people's rows.
create or replace function public.owns_original(object_name text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.photos p
    where p.id::text = split_part(storage.filename(object_name), '.', 1)
      and p.owner_id = auth.uid()
  )
$$;

drop policy if exists "editors upload photos" on storage.objects;
drop policy if exists "editors replace photos" on storage.objects;
drop policy if exists "editors delete photos" on storage.objects;

-- One expression, three verbs, deliberately identical: every way of writing
-- to this bucket should answer the same question, and the delete hole existed
-- precisely because it answered a different one.
create policy "editors upload photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (
      public.is_trip_editor(public.trip_of_object(name))
      or ((storage.foldername(name))[1] = 'loose'
          and (storage.foldername(name))[2] = auth.uid()::text)
      or ((storage.foldername(name))[1] = 'originals'
          and public.owns_original(name))
    )
  );

create policy "editors replace photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (
      public.is_trip_editor(public.trip_of_object(name))
      or ((storage.foldername(name))[1] = 'loose'
          and (storage.foldername(name))[2] = auth.uid()::text)
      or ((storage.foldername(name))[1] = 'originals'
          and public.owns_original(name))
    )
  );

create policy "editors delete photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (
      public.is_trip_editor(public.trip_of_object(name))
      or ((storage.foldername(name))[1] = 'loose'
          and (storage.foldername(name))[2] = auth.uid()::text)
      or ((storage.foldername(name))[1] = 'originals'
          and public.owns_original(name))
    )
  );
