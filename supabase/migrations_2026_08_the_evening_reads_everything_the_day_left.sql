-- The evening look-back was reading a third of the day.
--
-- It gathered photographs, runs, and flights from `public.flights` — and
-- nothing in this app has ever written to public.flights. Checked across
-- src/ and api/: the only inserts are in seed_flights.sql. Every flight
-- anybody books here is a planned_event, and planned_events is also where
-- every flight on a trip somebody is *on* lives. So the one message designed
-- to arrive on the evening of a travel day could not mention the travel.
--
-- `stays` came from day_tracks.visits, which is a list of places the phone
-- decided you had stopped, and the caller reduced it to a count. The hotel
-- was sitting in planned_events the whole time with its name, its city and
-- its nights on it, and was never read — so "you checked into the Rayavadee"
-- was unsayable while "1" was not.
--
-- And distance walked came from the photographs alone. Somebody who covered
-- fourteen kilometres and took four pictures got a number near zero, on the
-- line of the evening most worth having. location_visits is what this app
-- records when tracking is on and day_tracks.path is what a Google Timeline
-- export knew; neither was read.
--
-- Three more selects, no new tables.
--
-- location_visits is keyed on user_id rather than trip_id — it is a record
-- of a person, not of a holiday — so it is reached through the trip's owner.
-- Bounded to the day in question rather than fetched whole, because a
-- traveller who leaves tracking on has a row every few minutes.
create or replace function public.look_back_day(p_secret text, p_trip uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  out jsonb;
  owner uuid;
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;

  select t.owner_id into owner from public.trips t where t.id = p_trip;

  select jsonb_build_object(
    'trip', (select jsonb_build_object('id', t.id, 'slug', t.slug, 'title', t.title)
               from public.trips t where t.id = p_trip),
    'photos', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'taken_at', p.taken_at, 'taken_on', p.taken_on,
                 'lat', p.lat, 'lon', p.lon, 'city', p.city, 'seen', p.seen))
               from public.photos p
              where p.trip_id = p_trip
                and (p.taken_on = p_date or (p.taken_at at time zone 'utc')::date = p_date)), '[]'::jsonb),
    'flights', coalesce((select jsonb_agg(to_jsonb(f)) from public.flights f
                 where f.trip_id = p_trip
                   and (f.dep_time at time zone 'utc')::date = p_date), '[]'::jsonb),
    -- The flights and the hotels this app actually stores. Whole rows, so
    -- the caller can decide what a flight and a hotel each need from them
    -- without another round trip.
    'planned', coalesce((select jsonb_agg(to_jsonb(e)) from public.planned_events e
                 where e.trip_id = p_trip and e.event_date = p_date), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(r)) from public.runs r
              where r.trip_id = p_trip and r.run_date = p_date), '[]'::jsonb),
    'stays', coalesce((select d.visits from public.day_tracks d
               where d.trip_id = p_trip and d.track_date = p_date), '[]'::jsonb),
    -- What the app recorded itself, for whoever owns the trip. Every fix is
    -- another point on the floor of how far they moved.
    'visits', coalesce((select jsonb_agg(jsonb_build_object(
                 'arrived_at', v.arrived_at, 'departed_at', v.departed_at,
                 'lat', v.lat, 'lng', v.lng, 'source', v.source))
               from public.location_visits v
              where owner is not null and v.user_id = owner
                and (v.arrived_at at time zone 'utc')::date = p_date), '[]'::jsonb),
    -- And what an imported timeline knew, in the same shape.
    'path', coalesce((select d.path from public.day_tracks d
              where d.trip_id = p_trip and d.track_date = p_date), '[]'::jsonb),
    'been', coalesce((select jsonb_agg(distinct p.city) from public.photos p
              where p.trip_id = p_trip and p.city is not null
                and coalesce(p.taken_on, (p.taken_at at time zone 'utc')::date) < p_date), '[]'::jsonb),
    'where_last', (select jsonb_build_array(p.lat, p.lon) from public.photos p
                    where p.trip_id = p_trip and p.lat is not null and p.lon is not null
                      and coalesce(p.taken_on, (p.taken_at at time zone 'utc')::date) <= p_date
                    order by coalesce(p.taken_at, p.taken_on::timestamptz) desc nulls last
                    limit 1)
  ) into out;

  return out;
end $function$;
