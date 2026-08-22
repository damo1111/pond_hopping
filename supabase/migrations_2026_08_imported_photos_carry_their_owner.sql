-- The importer runs as the worker, not as a person, so auth.uid() is null and
-- the new default on photos.owner_id would leave every imported photograph
-- ownerless. It knows whose trip it is filling; it takes the owner from there.

create or replace function public.photo_import_store(
  p_secret text,
  p_item uuid,
  p_url text,
  p_thumb text,
  p_fingerprint text default null::text,
  p_taken_at timestamp with time zone default null::timestamp with time zone,
  p_lat double precision default null::double precision,
  p_lon double precision default null::double precision
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  it record;
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;

  select i.*, r.trip_id, t.owner_id
    into it
    from public.photo_import_items i
    join public.photo_imports r on r.id = i.import_id
    join public.trips t on t.id = r.trip_id
   where i.id = p_item;
  if not found then
    raise exception 'no such item';
  end if;

  -- Already here under a different name — the same photograph picked off the
  -- phone before it was picked from Google. Rules 0 and 2 could not see it:
  -- that row has no google_id, and its timestamp may have been absorbed.
  if p_fingerprint is not null and exists (
    select 1 from public.photos
     where trip_id = it.trip_id and fingerprint = p_fingerprint
  ) then
    return 'skipped';
  end if;

  insert into public.photos (
    trip_id, owner_id, url, thumb_url, google_id, original_url,
    taken_at, taken_on, lat, lon, fingerprint, kind
  )
  values (
    it.trip_id, it.owner_id, p_url, p_thumb, it.google_id, it.product_url,
    coalesce(p_taken_at, it.taken_at_hint),
    (coalesce(p_taken_at, it.taken_at_hint))::date,
    p_lat, p_lon, p_fingerprint, 'photo'
  )
  -- The backstop if two ticks ever overlap on the same run. The index is
  -- partial on google_id, so this cannot fire for phone uploads.
  on conflict (trip_id, google_id) where google_id is not null do nothing;

  return 'done';
end $function$;
