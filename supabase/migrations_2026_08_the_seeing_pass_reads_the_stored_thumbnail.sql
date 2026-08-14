-- The cheap seeing pass was asking the transform endpoint for a 512 of every
-- photograph, and Supabase counts one distinct origin image transformed per
-- month: six hundred against a quota of a hundred, growing with the library.
-- Every photograph already has a stored 400px thumbnail from upload; this
-- hands it to the caller so it can be used instead.
drop function if exists public.story_photos_to_see(text, uuid, integer, text);

create or replace function public.story_photos_to_see(
  p_secret text, p_trip uuid, p_limit integer default 24, p_detail text default 'low'
)
returns table(
  id uuid, url text, thumb_url text,
  taken_at timestamp with time zone, lat double precision, lon double precision
)
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;
  return query
    select p.id, p.url, p.thumb_url, p.taken_at, p.lat, p.lon
      from public.photos p
     where p.trip_id = p_trip
       and p.url is not null
       and coalesce(p.kind, 'photo') <> 'receipt'
       and (p.seen is null or (p_detail = 'high' and p.seen_detail = 'low'))
     order by p.taken_at nulls last
     limit greatest(1, least(p_limit, 60));
end $function$;
