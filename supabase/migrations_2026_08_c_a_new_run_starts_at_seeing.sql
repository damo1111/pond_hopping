-- A new run starts at "seeing", not at nothing.
--
--   rpc/claim_story_run — 400
--   null value in column "stage" of relation "story_runs" violates not-null constraint
--
-- claim_story_run resets a run's counters on conflict, and resets `stage` to
-- null along with them — against a column that is NOT NULL with a default of
-- 'seeing'. The comment beside it says "a new run counts from nothing", which
-- is the right intention written in the one value the column cannot hold.
--
-- It only bites on the second story. The insert path never names `stage`, so
-- the default applies and a trip's first run is fine; every re-run afterwards
-- takes the ON CONFLICT branch and is refused. Which is why it surfaced on a
-- trip that has had photographs added to it — the case where somebody most
-- wants the story written again.
--
-- 'seeing' rather than default: the reset is deliberate here, and naming the
-- starting stage next to `seen = 0, to_see = 0` says what a new run is, where
-- `default` would only say where to look it up.

create or replace function public.claim_story_run(
  p_trip uuid,
  p_step text default 'working it out'::text,
  p_stale interval default '00:15:00'::interval
)
returns boolean
language plpgsql
set search_path to 'public'
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
        -- A new run counts from nothing: back to the first stage, with
        -- nothing seen and nothing yet to see.
        stage       = 'seeing',
        seen        = 0,
        to_see      = 0
    where story_runs.finished_at is not null
       or story_runs.started_at < now() - p_stale
  returning trip_id into got;

  return got is not null;
end;
$$;
