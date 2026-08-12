-- Nine in the evening, on the day you are having.
--
-- `dayLookBack.js` and `dayPush.js` have been finished and tested for a
-- while and nothing has ever called them. This is the half that calls them:
-- a record of what was said, four functions the worker may use, and an
-- hourly tick.
--
-- ── Why hourly and not once a night ───────────────────────────────────
--
-- Because nine in the evening is a *local* time, and the whole point of
-- this is to arrive at the end of the day somebody is actually having. A
-- single nightly job would fire at nine o'clock UTC, which is four in the
-- afternoon in New York and five in the morning in Auckland. So the tick is
-- hourly, and the decision about whether it is yet nine o'clock where they
-- are is made by whenToSend() in the worker — from the zone of the last
-- located photograph of that day, because on a travel day "where they are"
-- is the far end.
--
-- Two candidate dates every hour, today and yesterday in UTC, because 21:00
-- local is the previous UTC day everywhere west of Greenwich and the same
-- one everywhere east of it.
--
-- ── Why there is no service key in this ───────────────────────────────
--
-- Same rule as the story worker, and the same shared secret. Four functions,
-- each doing exactly one thing, none of them able to reach a trip the caller
-- has not named. The worker cannot enumerate anything it was not handed.

-- ── What was said, and when ──────────────────────────────────────────────
--
-- Three jobs in one small table, which is why it is worth having rather than
-- being derivable:
--
--   1. Nothing is ever sent twice. The primary key is the guarantee.
--   2. `shape` is what makes the writing vary — dayPush.js needs to know
--      that it led with your feet twice last week so it can lead with
--      something else tonight.
--   3. `facts` is what the screen reads, so opening the notification does
--      not recompute a day from three hundred photographs on a phone.
create table if not exists public.day_look_backs (
  trip_id uuid not null references public.trips(id) on delete cascade,
  -- Lower-cased on the way in. Addresses are compared case-insensitively
  -- everywhere else in this app and a second row for the same person with a
  -- capital letter in it would defeat the primary key's whole purpose.
  email   text not null,
  on_date date not null,
  shape   text,
  line    text not null,
  facts   jsonb,
  sent_at timestamptz not null default now(),
  primary key (trip_id, email, on_date)
);

alter table public.day_look_backs enable row level security;

-- Yours, and only yours. A look-back is about one person's day: two people
-- on the same trip walked different distances and photographed different
-- things, and the trip being shared does not make the evening shared.
drop policy if exists "your own evenings" on public.day_look_backs;
create policy "your own evenings"
  on public.day_look_backs for select
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '@nobody')));

-- Deliberately no insert, update or delete policy. The only thing that
-- writes here is look_back_sent() below, which is SECURITY DEFINER and
-- gated on the shared secret. Nobody can forge an evening, and — more to
-- the point — nobody can delete one to make it send again.

comment on table public.day_look_backs is
  'One row per person per trip per day: the evening look-back that was sent.';

-- ── What the worker may do ───────────────────────────────────────────────

/**
 * Whose evening might be due.
 *
 * "Might", not "is": this cannot tell, because the answer depends on the
 * zone of the last photograph of the day, which is not a thing SQL here
 * should be working out. It hands back everything plausible and the worker
 * decides. The list is small — it is bounded by people currently on a trip.
 *
 * The photograph test does the real narrowing. A trip with no end date that
 * started in 2019 is otherwise a candidate forever; requiring a photograph
 * taken on the day in question means an old open-ended trip produces
 * nothing, and a live one produces exactly the people having it.
 */
create or replace function public.look_back_candidates(p_secret text)
returns table (trip_id uuid, email text, on_date date)
language plpgsql security definer set search_path = public as $$
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;

  return query
  with days as (
    select d::date as on_date from unnest(array[
      (now() at time zone 'utc')::date,
      ((now() at time zone 'utc') - interval '1 day')::date
    ]) d
  ),
  -- Travellers, plus the owner whether or not anybody remembered to add
  -- them as a member of their own trip. A viewer who was not there is not
  -- included: it is a summary of your day, and it was not their day.
  who as (
    select m.trip_id, lower(m.email) as email
      from public.trip_members m
     where coalesce(m.is_traveller, false) and m.email is not null
    union
    select t.id, lower(u.email)
      from public.trips t
      join auth.users u on u.id = t.owner_id
     where u.email is not null
  )
  select w.trip_id, w.email, dd.on_date
    from who w
    join public.trips t on t.id = w.trip_id
    cross join days dd
   where coalesce(t.is_demo, false) = false
     -- A day's slack at each end, because the local evening of the last day
     -- of a trip can be the following day in UTC.
     and dd.on_date between t.start_date - 1 and coalesce(t.end_date, dd.on_date) + 1
     and exists (
       select 1 from public.photos p
        where p.trip_id = w.trip_id
          and (p.taken_on = dd.on_date or (p.taken_at at time zone 'utc')::date = dd.on_date)
     )
     and not exists (
       select 1 from public.day_look_backs b
        where b.trip_id = w.trip_id and b.email = w.email and b.on_date = dd.on_date
     );
end $$;

/**
 * Everything that day was, unread and uncounted.
 *
 * The counting is `lookBackAt()` in the app's own code, where it is tested
 * against fixtures. This hands over raw rows and nothing else — the same
 * division as story_evidence(): SQL fetches, JavaScript decides.
 */
create or replace function public.look_back_day(p_secret text, p_trip uuid, p_date date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;

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
    'runs', coalesce((select jsonb_agg(to_jsonb(r)) from public.runs r
              where r.trip_id = p_trip and r.run_date = p_date), '[]'::jsonb),
    -- The Google Timeline day, when there is one. Only the count is used
    -- today, but it is the difference between "you were out" and silence on
    -- a day somebody took no photographs.
    'stays', coalesce((select d.visits from public.day_tracks d
               where d.trip_id = p_trip and d.track_date = p_date), '[]'::jsonb),
    -- Everywhere they had already been on this trip, so "a new pond" means
    -- new. Cities rather than coordinates: a different corner of the same
    -- square is not a new place.
    'been', coalesce((select jsonb_agg(distinct p.city) from public.photos p
              where p.trip_id = p_trip and p.city is not null
                and coalesce(p.taken_on, (p.taken_at at time zone 'utc')::date) < p_date), '[]'::jsonb),
    -- The last place on this trip anybody knows about, up to and including
    -- this day. Only used to answer "is it nine o'clock where they are"
    -- when not one of today's photographs carried a fix — which is an
    -- ordinary day with location switched off, and without this it is a day
    -- that can never be sent at all.
    'where_last', (select jsonb_build_array(p.lat, p.lon) from public.photos p
                    where p.trip_id = p_trip and p.lat is not null and p.lon is not null
                      and coalesce(p.taken_on, (p.taken_at at time zone 'utc')::date) <= p_date
                    order by coalesce(p.taken_at, p.taken_on::timestamptz) desc nulls last
                    limit 1)
  ) into out;

  return out;
end $$;

/**
 * What the last few evenings led with, newest first.
 *
 * Feeds `pushLine(facts, { recent })`, which is the whole defence against a
 * fortnight of notifications that all read the same. Scoped to one person on
 * one trip, because it is their fortnight.
 */
create or replace function public.look_back_recent(
  p_secret text, p_trip uuid, p_email text, p_before date, p_limit integer default 6
) returns text[]
language plpgsql security definer set search_path = public as $$
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;
  return (
    select coalesce(array_agg(shape order by on_date desc), '{}')
      from (
        select b.shape, b.on_date
          from public.day_look_backs b
         where b.trip_id = p_trip
           and b.email = lower(p_email)
           and b.on_date < p_before
           and b.shape is not null
         order by b.on_date desc
         limit greatest(p_limit, 0)
      ) recent
  );
end $$;

/**
 * Write it down. Returns false if there was already one, which is the
 * worker's signal that somebody else got there first.
 *
 * The insert is the lock. Two invocations racing — an hourly tick that
 * overran meeting the next one — both compute the same evening, and exactly
 * one of them is allowed to send it. Recording before sending would risk a
 * silent evening; recording after risks two pushes. This records first and
 * only sends on a true, so the failure mode is a missed notification rather
 * than a duplicated one, which is the right way round for something that
 * arrives on a lock screen.
 */
create or replace function public.look_back_sent(
  p_secret text, p_trip uuid, p_email text, p_date date,
  p_shape text, p_line text, p_facts jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare got uuid;
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;

  insert into public.day_look_backs (trip_id, email, on_date, shape, line, facts)
  values (p_trip, lower(p_email), p_date, p_shape, p_line, p_facts)
  on conflict (trip_id, email, on_date) do nothing
  returning trip_id into got;

  return got is not null;
end $$;

-- ── The tick ─────────────────────────────────────────────────────────────

/**
 * Poke the worker once an hour.
 *
 * One call, not one per candidate: there is no model in this path, so the
 * whole sweep is cheap and looping inside the endpoint costs one invocation
 * instead of forty. Fire and forget, like the story ticker — pg_net does not
 * wait, and the record of what happened is day_look_backs.
 */
create or replace function public.tick_day_look_backs()
returns integer language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select value into s from app_config where key = 'push_secret';
  if s is null then
    return 0;
  end if;

  perform net.http_post(
    url     := 'https://pond.eend.app/api/day-look-back?key=' || s,
    body    := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return 1;
end $$;

-- On the hour. The worker's own arithmetic decides whose hour it is.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'day-look-backs') then
    perform cron.unschedule('day-look-backs');
  end if;
end $$;
select cron.schedule('day-look-backs', '0 * * * *', $$select public.tick_day_look_backs()$$);
