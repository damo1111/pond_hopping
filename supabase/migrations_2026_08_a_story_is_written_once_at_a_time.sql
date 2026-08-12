-- Where a story run lives while it is happening.
--
-- Until now the whole pipeline ran inside a browser tab, so "is this trip
-- being written?" was a variable in a React component. Nothing else could
-- see it: locking the phone killed the run, and opening the app again
-- started a second one on top of the first.
--
-- One row per trip, because a trip is written once at a time. The row is
-- also what a screen reads to show progress, instead of driving the run
-- itself and being the only thing that knows about it.
create table if not exists public.story_runs (
  trip_id     uuid primary key references public.trips(id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  step        text,
  note        text
);

alter table public.story_runs enable row level security;

-- Anybody who can see the trip can see whether it is being written; only an
-- editor can start one. Reading is deliberately the wider grant: a run in
-- progress is a fact about the trip, not a secret within it.
drop policy if exists "story runs are visible with the trip" on public.story_runs;
create policy "story runs are visible with the trip"
  on public.story_runs for select
  using (public.trip_is_visible(trip_id));

drop policy if exists "only an editor writes a story run" on public.story_runs;
create policy "only an editor writes a story run"
  on public.story_runs for all
  using (public.is_trip_editor(trip_id))
  with check (public.is_trip_editor(trip_id));

-- Taking the run, or being told somebody else has it.
--
-- Has to be one statement. Two calls — read it, then claim it — is a race
-- with a window wide enough for a double tap to fit through, and the whole
-- point of this table is that two runs never start.
--
-- A run that never finished does not hold the trip for ever. A serverless
-- invocation can be killed without getting the chance to say so, and a trip
-- that can never be written again because of a crash forty minutes ago is a
-- worse failure than the double run this prevents. Past `p_stale` the claim
-- is taken over.
create or replace function public.claim_story_run(
  p_trip  uuid,
  p_step  text default 'working it out',
  p_stale interval default interval '15 minutes'
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  got uuid;
begin
  if not public.is_trip_editor(p_trip) then
    return false;
  end if;

  insert into public.story_runs (trip_id, started_at, step)
  values (p_trip, now(), p_step)
  on conflict (trip_id) do update
    set started_at  = now(),
        finished_at = null,
        ok          = null,
        note        = null,
        step        = excluded.step,
        -- A new run counts from nothing. Without these it inherited the last
        -- run's progress, so a second build began at "47 photographs read"
        -- and the bar on screen was a mixture of two different runs.
        stage       = null,
        seen        = 0,
        to_see      = 0
    where story_runs.finished_at is not null
       or story_runs.started_at < now() - p_stale
  returning trip_id into got;

  return got is not null;
end;
$$;

grant execute on function public.claim_story_run(uuid, text, interval) to authenticated;
