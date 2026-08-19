-- A pick that survives the tab it was made in.
--
-- Seventy photographs were chosen in Google's picker, Google said "Done!",
-- and nothing arrived. Not a failure — a loss. The picker session id existed
-- in exactly one place: the JavaScript variable in the tab that opened it.
-- Signing in again replaced that tab, and the id went with it. Google still
-- held the pick; nobody left could name it.
--
-- There is no list-sessions endpoint on Google's side, so an id that is not
-- written down is a pick that cannot be recovered by anyone, ever. That is
-- the whole bug. The fix is one row, written before the picker is opened.
--
-- From then on the browser is an optimisation rather than the mechanism: it
-- still polls and still finishes in seconds when it is alive, and when it is
-- not, a cron sweep does exactly the same work a minute later.

create table if not exists public.photo_picker_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Null means "a new trip, made afterwards out of these photographs' dates".
  -- The sweep cannot invent that trip, so those rows are kept for the app to
  -- resume rather than finished here. Recorded either way: a pick nobody can
  -- name is the thing being fixed.
  trip_id uuid references public.trips(id) on delete cascade,
  session_id text not null unique,
  -- The Google access token the picker was opened with. Same arrangement as
  -- photo_imports: an hour is far longer than any of this needs.
  token text,
  token_dies_at timestamptz,
  opened_at timestamptz not null default now(),
  looked_at timestamptz,
  settled_at timestamptz,
  import_id uuid references public.photo_imports(id) on delete set null,
  note text
);

create index if not exists photo_picker_sessions_open
  on public.photo_picker_sessions (opened_at)
  where settled_at is null;

-- RLS on with no policies at all, which is deliberate and looks like an
-- omission, so: this table holds a live Google access token. Nothing that
-- ships in the browser may read it. The service role is the only way in, the
-- same arrangement google_grants uses and for the same reason.
alter table public.photo_picker_sessions enable row level security;

comment on table public.photo_picker_sessions is
  'Google Photos picker sessions, written down before the picker opens so a '
  'pick outlives the tab. RLS is on with NO policies on purpose — the row '
  'carries a live access token and is reachable only by the service role.';

-- ── Written down on the way out ──────────────────────────────────────────

create or replace function public.open_picker_session(
  p_trip uuid,
  p_session text,
  p_token text,
  p_token_lasts interval default '55 minutes'
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  row_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  -- The one authorisation this gets, made here by a person against their own
  -- token — exactly as start_photo_import does. The sweep later trusts this
  -- row rather than re-deciding with no user to ask.
  if p_trip is not null and not public.is_trip_editor(p_trip) then
    raise exception 'not yours to add to';
  end if;
  if p_session is null or length(p_session) = 0 then
    raise exception 'no session';
  end if;

  insert into public.photo_picker_sessions (user_id, trip_id, session_id, token, token_dies_at)
  values (auth.uid(), p_trip, p_session, p_token, now() + p_token_lasts)
  on conflict (session_id) do update
     set token = excluded.token,
         token_dies_at = excluded.token_dies_at
  returning id into row_id;

  return row_id;
end $$;

grant execute on function public.open_picker_session(uuid, text, text, interval) to authenticated;

-- ── The sweep ────────────────────────────────────────────────────────────

create or replace function public.picker_sessions_waiting(p_secret text)
returns table(id uuid, session_id text, trip_id uuid, token text)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;
  return query
    select s.id, s.session_id, s.trip_id, s.token
      from public.photo_picker_sessions s
     where s.settled_at is null
       and s.trip_id is not null
       and s.token is not null
       and (s.token_dies_at is null or s.token_dies_at > now())
       -- Not oftener than every twenty seconds per session, and never
       -- alongside the browser's own first poll, which usually wins.
       and (s.looked_at is null or s.looked_at < now() - interval '20 seconds')
     order by s.opened_at
     limit 20;
end $$;

create or replace function public.picker_session_looked(p_secret text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;
  update public.photo_picker_sessions set looked_at = now() where id = p_id;
end $$;

/**
 * Everything picked, into a queued import — with no person present.
 *
 * The authorisation was made by one, at open_picker_session, against their
 * own token. This carries out that decision; it never makes a new one, which
 * is why it reads trip and asker off the row rather than taking them.
 */
create or replace function public.finish_picker_session(
  p_secret text,
  p_id uuid,
  p_items jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.photo_picker_sessions;
  run uuid;
  fresh integer;
  push text;
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;

  select * into s from public.photo_picker_sessions where id = p_id and settled_at is null;
  if not found then
    return null;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    update public.photo_picker_sessions
       set settled_at = now(), note = coalesce(p_note, 'nothing was picked')
     where id = p_id;
    return null;
  end if;

  insert into public.photo_imports (trip_id, asked_by, token, token_dies_at)
  values (s.trip_id, s.user_id, s.token, s.token_dies_at)
  returning id into run;

  -- Already here is already done. The browser does this check too, before
  -- sending; the sweep has no browser, so it does it in the one place it can.
  insert into public.photo_import_items (import_id, google_id, fetch_from, product_url, taken_at_hint)
  select run,
         i->>'googleId',
         i->>'fetchFrom',
         i->>'productUrl',
         nullif(i->>'takenAtHint','')::timestamptz
    from jsonb_array_elements(p_items) i
   where i->>'googleId' is not null
     and i->>'fetchFrom' is not null
     and not exists (
       select 1 from public.photos ph
        where ph.trip_id = s.trip_id
          and ph.google_id = i->>'googleId'
     )
  on conflict (import_id, google_id) do nothing;

  select count(*) into fresh from public.photo_import_items where import_id = run;

  if fresh = 0 then
    -- Every one of them was already on the trip. Not a failure, and not an
    -- import: the empty run is removed rather than left looking stalled.
    delete from public.photo_imports where id = run;
    update public.photo_picker_sessions
       set settled_at = now(), note = 'all of them were already here'
     where id = p_id;
    return null;
  end if;

  update public.photo_picker_sessions
     set settled_at = now(), import_id = run, note = p_note
   where id = p_id;

  -- Start it now rather than at the next minute boundary, same as
  -- start_photo_import. Wrapped: a run queued and started a minute late is
  -- far better than one that is never queued.
  begin
    select value into push from app_config where key = 'push_secret';
    if push is not null then
      perform net.http_post(
        url     := 'https://pond.eend.app/api/import-google-photos?key=' || push,
        body    := jsonb_build_object('import_id', run),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
      update public.photo_imports set tick_at = now() where id = run;
    end if;
  exception when others then
    null;
  end;

  return run;
end $$;

/**
 * Give up on one, out loud.
 *
 * A session Google no longer recognises, or one whose token died before
 * anybody finished picking. Settled with a reason rather than left in the
 * list to be retried once a minute forever.
 */
create or replace function public.abandon_picker_session(p_secret text, p_id uuid, p_why text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.story_worker_ok(p_secret) then
    raise exception 'no';
  end if;
  update public.photo_picker_sessions
     set settled_at = now(), note = left(coalesce(p_why, 'gave up'), 300)
   where id = p_id;
end $$;

-- ── The handle ───────────────────────────────────────────────────────────

create or replace function public.tick_picker_sessions()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s text;
  n integer := 0;
begin
  select value into s from app_config where key = 'push_secret';
  if s is null then
    return 0;
  end if;

  -- Anything nobody ever finished picking in is let go of. An hour is far
  -- longer than a pick takes, and a row sitting there holding a dead token
  -- is worse than one that admits it stopped.
  update public.photo_picker_sessions
     set settled_at = now(), note = 'nobody finished picking'
   where settled_at is null
     and opened_at < now() - interval '1 hour';

  if exists (select 1 from public.photo_picker_sessions where settled_at is null and trip_id is not null) then
    perform net.http_post(
      url     := 'https://pond.eend.app/api/finish-google-pick?key=' || s,
      body    := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    n := 1;
  end if;

  return n;
end $$;

select cron.schedule('picker-sessions', '* * * * *', 'select public.tick_picker_sessions()');
