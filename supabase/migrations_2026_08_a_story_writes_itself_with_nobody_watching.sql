-- The last thing holding a story to a browser tab.
--
-- api/build-story.js already reconstructs and writes on the server. What is
-- still in the tab is the reading of the photographs — three hundred of them,
-- in small parallel batches, which does not fit in one 300-second invocation
-- and so has to be a queue of small steps instead.
--
-- A queue needs something outside the request to turn the handle. That is
-- pg_cron: once a minute it looks for runs that want a nudge and pokes an
-- endpoint through pg_net, exactly as the signup trigger already does.
--
-- ── Why there is no service key in this ───────────────────────────────────
--
-- A worker woken by cron has no signed-in person behind it, so the usual
-- answer is a service key — which switches row-level security off entirely
-- for whatever holds it. That would undo the best property of the endpoint
-- this extends.
--
-- Instead the worker gets exactly the operations it needs, as SECURITY
-- DEFINER functions gated on the shared secret Vercel already holds as
-- PUSH_SECRET. Six functions, every one of them scoped to a single trip that
-- somebody has already been authorised to write: claim_story_run() checks
-- is_trip_editor() with the person's own token, and no row reaches this
-- worker without having gone through it. Authorisation happens once, by the
-- user; the worker only carries it out.

create extension if not exists pg_cron with schema cron;

-- How far through a run is, so it can be picked up where it stopped.
alter table public.story_runs add column if not exists stage   text not null default 'seeing';
alter table public.story_runs add column if not exists seen    integer not null default 0;
alter table public.story_runs add column if not exists to_see  integer not null default 0;
-- When the worker was last poked about this run. Stops a slow batch being
-- poked again a minute later while it is still going.
alter table public.story_runs add column if not exists tick_at timestamptz;

comment on column public.story_runs.stage is
  'seeing → writing → done. A run that is not finished is at one of these.';

-- The secret, in one place, checked the same way everywhere.
create or replace function public.story_worker_ok(p_secret text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_secret is not null
     and length(p_secret) > 20
     and exists (select 1 from app_config where key = 'push_secret' and value = p_secret)
$$;

-- ── What the worker may do ───────────────────────────────────────────────

/** Runs that want a tick: unfinished, and not poked in the last two minutes. */
create or replace function public.story_work_waiting(p_secret text)
returns table (trip_id uuid, stage text, seen integer, to_see integer, started_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;
  return query
    select r.trip_id, r.stage, r.seen, r.to_see, r.started_at
      from public.story_runs r
     where r.finished_at is null
       -- `is distinct from` and not `<>`: a freshly claimed run has no stage
       -- yet, and `null <> 'done'` is null, which excludes the row. A run
       -- that has only just started is exactly the one most needing work.
       and r.stage is distinct from 'done'
       and (r.tick_at is null or r.tick_at < now() - interval '2 minutes')
       -- The comment that used to sit here said "a run nothing has touched
       -- for a quarter of an hour is abandoned" — which is the right rule,
       -- and it was written against the wrong column. It tested started_at,
       -- so the bound was on how long a run had been going rather than on
       -- how long it had been silent.
       --
       -- The reading is ten photographs a tick and one tick a minute, so
       -- fifteen minutes buys a hundred and fifty photographs. Thailand has
       -- two hundred and thirty-nine: at 05:27 it began, at 05:42 it had read
       -- fifty, and the ticker stopped offering it work. It sat in `seeing`
       -- for ever with no error and no note. Every trip larger than about a
       -- hundred and fifty photographs was unwritable, and the small ones
       -- finished, which is why it looked like one trip misbehaving.
       --
       -- Silence is already bounded by the tick_at condition above and by
       -- claim_story_run(), which lets a quiet claim be taken over. This is
       -- only an outer ceiling so a genuinely wedged run is not poked until
       -- the end of time — three hours is about eighteen hundred
       -- photographs, more than any holiday and far less than for ever.
       and r.started_at > now() - interval '3 hours'
     order by r.started_at
     limit 20;
end $$;

/** Photographs still to look at, oldest first, and the count outstanding. */
create or replace function public.story_photos_to_see(
  p_secret text, p_trip uuid, p_limit integer default 24, p_detail text default 'low'
) returns table (id uuid, url text, taken_at timestamptz, lat double precision, lon double precision)
language plpgsql security definer set search_path = public as $$
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;
  return query
    select p.id, p.url, p.taken_at, p.lat, p.lon
      from public.photos p
     where p.trip_id = p_trip
       and p.url is not null
       and coalesce(p.kind, 'photo') <> 'receipt'
       and (p.seen is null or (p_detail = 'high' and p.seen_detail = 'low'))
     order by p.taken_at nulls last
     limit greatest(1, least(p_limit, 60));
end $$;

/** One photograph, written down as it comes back — so a worker that dies
 *  halfway has still paid for what it looked at, and nobody buys the same
 *  photograph twice. */
create or replace function public.story_photo_seen(
  p_secret text, p_photo uuid, p_seen jsonb, p_detail text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;
  update public.photos
     set seen = p_seen, seen_at = now(), seen_detail = p_detail
   where id = p_photo;
  return found;
end $$;

/** Where a run has got to, and how much is left. */
create or replace function public.story_run_at(
  p_secret text, p_trip uuid, p_stage text, p_seen integer default null,
  p_to_see integer default null, p_note text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;
  update public.story_runs
     set stage       = coalesce(p_stage, stage),
         step        = case when p_stage = 'seeing' then 'looking'
                            when p_stage = 'writing' then 'working it out'
                            else null end,
         seen        = coalesce(p_seen, seen),
         to_see      = coalesce(p_to_see, to_see),
         note        = coalesce(p_note, note),
         tick_at     = now(),
         finished_at = case when p_stage = 'done' then now() else null end,
         ok          = case when p_stage = 'done' then true else null end
   where trip_id = p_trip;
  return found;
end $$;

/** Everything the writing stage needs, in one object, for a trip it has
 *  already been authorised to write. */
create or replace function public.story_evidence(p_secret text, p_trip uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;
  select jsonb_build_object(
    'trip',      (select to_jsonb(t) from trips t where t.id = p_trip),
    'photos',    coalesce((select jsonb_agg(jsonb_build_object(
                    'id', p.id, 'taken_at', p.taken_at, 'taken_on', p.taken_on,
                    'lat', p.lat, 'lon', p.lon, 'seen', p.seen))
                  from photos p where p.trip_id = p_trip), '[]'::jsonb),
    'entries',   coalesce((select jsonb_agg(jsonb_build_object(
                    'entry_date', j.entry_date, 'note', j.note, 'built_from', j.built_from))
                  from journal_entries j where j.trip_id = p_trip), '[]'::jsonb),
    'flights',   coalesce((select jsonb_agg(to_jsonb(f)) from flights f where f.trip_id = p_trip), '[]'::jsonb),
    'runs',      coalesce((select jsonb_agg(to_jsonb(r)) from runs r where r.trip_id = p_trip), '[]'::jsonb),
    'tracks',    coalesce((select jsonb_agg(jsonb_build_object(
                    'track_date', d.track_date, 'visits', d.visits))
                  from day_tracks d where d.trip_id = p_trip), '[]'::jsonb),
    'visits',    coalesce((select jsonb_agg(to_jsonb(v)) from location_visits v
                  where v.user_id = (select owner_id from trips where id = p_trip)), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(to_jsonb(q)) from story_questions q where q.trip_id = p_trip), '[]'::jsonb),
    'story',     (select to_jsonb(s) from trip_stories s where s.trip_id = p_trip),
    'voice',     coalesce((select pr.learn_my_voice from profiles pr
                  where pr.id = (select owner_id from trips where id = p_trip)), false),
    'owner',     (select owner_id from trips where id = p_trip)
  ) into out;
  return out;
end $$;

/** The story, and any new questions, saved together. */
create or replace function public.story_save(
  p_secret text, p_trip uuid, p_row jsonb, p_asks jsonb default '[]'::jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;

  insert into public.trip_stories (trip_id, opening, chapters, closing, reconstruction, voice, updated_at)
  values (
    p_trip,
    p_row->>'opening',
    coalesce(p_row->'chapters', '[]'::jsonb),
    p_row->>'closing',
    p_row->'reconstruction',
    coalesce(p_row->>'voice', 'narrator'),
    now()
  )
  on conflict (trip_id) do update
     set opening = excluded.opening,
         chapters = excluded.chapters,
         closing = excluded.closing,
         reconstruction = excluded.reconstruction,
         voice = excluded.voice,
         updated_at = now();

  insert into public.story_questions (trip_id, on_date, asks, because)
  select p_trip, nullif(a->>'on_date','')::date, a->>'asks', a->>'because'
    from jsonb_array_elements(coalesce(p_asks, '[]'::jsonb)) a
   where coalesce(a->>'asks','') <> '';

  return true;
end $$;

-- ── Turning the handle ───────────────────────────────────────────────────

/**
 * Poke the worker once for every run that wants it.
 *
 * Fire and forget, exactly like the signup notification: pg_net does not
 * wait for an answer, and this function does not care what the answer was.
 * The record of what happened is story_runs, which the worker updates.
 */
create or replace function public.tick_story_runs()
returns integer language plpgsql security definer set search_path = public as $$
declare
  s text;
  r record;
  n integer := 0;
begin
  select value into s from app_config where key = 'push_secret';
  if s is null then
    return 0;
  end if;

  for r in select * from public.story_work_waiting(s) loop
    perform net.http_post(
      url     := 'https://pond.eend.app/api/story-step?key=' || s,
      body    := jsonb_build_object('trip_id', r.trip_id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    -- Marked as poked straight away, so a batch that takes three minutes is
    -- not poked again at the one-minute mark and asked to do it all twice.
    update public.story_runs set tick_at = now() where trip_id = r.trip_id;
    n := n + 1;
  end loop;
  return n;
end $$;

select cron.schedule('story-runs', '* * * * *', $$select public.tick_story_runs()$$);
