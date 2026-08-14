-- The photos table says who may see a photograph. The bucket said everybody.
--
-- Three separate holes, closed in the order they could be closed:
--
-- 1. "public read photos" granted SELECT on storage.objects for anon across
--    the whole bucket. That is not "public urls work" — those come from the
--    bucket being public and are unaffected. What it granted was the ability
--    to *list*: to walk every object and read the paths. So the photographs
--    were never protected by having unguessable names, because the names
--    could simply be asked for, with the anon key that ships in the app.
--
-- 2. INSERT and UPDATE were granted to `public`, which includes anon. Anyone
--    at all could upload into the bucket and overwrite anything in it. This
--    could not be closed while the import worker and the thumbnail backfill
--    held that same anon key; they now hold a service credential, which
--    bypasses RLS entirely and so needs no policy here.
--
-- 3. There was no DELETE policy at all, so photoIngest.js:96 has been trying
--    to clean up abandoned uploads since it was written and failing silently.

drop policy if exists "public read photos" on storage.objects;
drop policy if exists "public upload photos" on storage.objects;
drop policy if exists "public update photos" on storage.objects;

-- A trip id out of a storage path, or null if that is not what it is.
-- Uploads are written as {trip_id}/{something}, and a policy that raised on
-- a path of another shape would refuse the upload with a database error
-- rather than a permission one.
create or replace function public.trip_of_object(name text)
returns uuid language plpgsql immutable
as $function$
declare
  first text := (storage.foldername(name))[1];
begin
  return first::uuid;
exception when others then
  return null;
end $function$;

-- Signed in, and only into a trip you may edit — the same is_trip_editor()
-- the photos *table* uses, so the file and its row finally agree about who
-- may write them.
--
-- The originals/ exception is the one client upload with no trip in its
-- path: "keep originals" queues full-size files in IndexedDB under a queue
-- id generated on the phone, which belongs to no trip because the point is
-- that it survives whether or not the photograph was ever filed. Scoping to
-- the trip alone would have refused every one of them.
create policy "editors upload photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (public.is_trip_editor(public.trip_of_object(name))
         or (storage.foldername(name))[1] = 'originals')
  );

create policy "editors replace photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (public.is_trip_editor(public.trip_of_object(name))
         or (storage.foldername(name))[1] = 'originals')
  );

create policy "editors delete photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos');
