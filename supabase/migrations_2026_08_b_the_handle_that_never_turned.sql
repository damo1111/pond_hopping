-- The handle that never turned.
--
-- tick_photo_imports() has failed on every single run since it was created,
-- once a minute, silently. Not one photograph has ever been dispatched to the
-- worker; the whole route existed and had never executed once.
--
--   ERROR: record "r" is not assigned yet
--   DETAIL: The tuple structure of a not-yet-assigned record is indeterminate.
--
-- The function declares `r record` for the dispatch loop at the bottom, and
-- an earlier statement writes `update public.photo_imports r ... where
-- r.finished_at is null`. PL/pgSQL resolves `r` to the declared variable
-- rather than to the table alias, finds it unassigned, and raises — before
-- reaching the loop that posts anything anywhere.
--
-- It is invisible from the app: the queue accepts the work, the rows sit at
-- 'waiting', the progress bar says "starting…" and means it. cron.job_run_details
-- is the only place it was ever written down.
--
-- The fix is the alias. `pi` collides with nothing, and every reference to a
-- column of that table is now qualified by it.

create or replace function public.tick_photo_imports()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s text;
  r record;
  n integer := 0;
begin
  select value into s from app_config where key = 'push_secret';
  if s is null then
    return 0;
  end if;

  -- Anything whose hour is up is finished, said so, and has its token
  -- dropped. A run that quietly sits there holding a dead credential is
  -- worse than one that admits it stopped.
  update public.photo_imports
     set finished_at = now(),
         note = coalesce(note, 'Google’s hour ran out — pick again to carry on'),
         token = null
   where finished_at is null
     and token_dies_at is not null
     and token_dies_at <= now();

  -- And anything with nothing left to do. Aliased `pi`, not `r`: `r` is the
  -- record variable declared above, and PL/pgSQL gives the variable the name.
  update public.photo_imports pi
     set finished_at = now(), token = null
   where pi.finished_at is null
     and not exists (
       select 1 from public.photo_import_items i
        where i.import_id = pi.id and i.state = 'waiting'
     );

  for r in select * from public.photo_imports_waiting(s) loop
    perform net.http_post(
      url     := 'https://pond.eend.app/api/import-google-photos?key=' || s,
      body    := jsonb_build_object('import_id', r.import_id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    update public.photo_imports set tick_at = now() where id = r.import_id;
    n := n + 1;
  end loop;
  return n;
end $$;
