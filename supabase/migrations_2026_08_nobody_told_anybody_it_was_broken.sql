-- Knowing what people do, and knowing when it breaks.
--
-- The app was white-screening on every load for hours, and the way anybody
-- found out was a screenshot. The error boundary did its job — it said
-- something failed and offered a way back — and then wrote the reason to a
-- console nobody was looking at. There was no record anywhere that it had
-- happened, to how many people, on which build, or since when.
--
-- Two tables, because they answer two different questions.
--
--   app_events   what people do. Append-only, one row per thing that
--                happened, cheap enough to write freely.
--   app_errors   what is broken. One row per distinct fault per session,
--                with a count, because a crash loop must not become
--                fourteen thousand rows.
--
-- Both are writable by anyone and readable by nobody, which is the same
-- shape app_events already had: the anon key can log, and can never read
-- another person's usage back out.

-- ── app_events: who, and on what ──────────────────────────────────────
--
-- It had session_id, event, detail, created_at. Two things were missing and
-- both are the first question anybody asks of an event log.
--
-- `build` is the difference between "the app is broken" and "the app has
-- been broken since Tuesday's deploy". `user_id` is the difference between
-- eighty sessions and eight people; it is null for signed-out use, which is
-- most of the example trip, and that is a fact worth being able to see.

alter table public.app_events add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.app_events add column if not exists build text;

create index if not exists app_events_when on public.app_events (created_at desc);
create index if not exists app_events_what on public.app_events (event, created_at desc);

-- ── app_errors ────────────────────────────────────────────────────────

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  build text,
  -- crash: React unmounted the tree. error: an uncaught exception.
  -- rejection: a promise nobody caught. api: one of our own endpoints
  -- said no. refused: a write the database declined.
  kind text not null,
  message text not null,
  stack text,
  -- The component stack for a crash, the endpoint for an api failure, the
  -- route for anything else. One column because it is only ever read by a
  -- person trying to find the thing.
  where_at text,
  seen integer not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);

-- What makes two reports the same report. Build is in the key on purpose:
-- a fault that comes back after a deploy is news, not a repeat.
create unique index if not exists app_errors_same
  on public.app_errors (session_id, kind, coalesce(build, ''), md5(message));

create index if not exists app_errors_recent on public.app_errors (last_at desc);
create index if not exists app_errors_by_build on public.app_errors (build, last_at desc);

alter table public.app_errors enable row level security;

-- No policies at all: no direct insert, no select, from any key. Everything
-- goes through the function below, which is the only thing that can dedupe
-- safely. A table anyone could update is a table anyone could rewrite.
revoke all on public.app_errors from anon, authenticated;

/**
 * Write down a fault, or bump the one already written.
 *
 * SECURITY DEFINER because the upsert needs UPDATE on a table nobody is
 * allowed to update. It takes only what it needs, returns nothing, and
 * cannot be used to read anything back — which matters, because this is
 * callable with the anon key from a browser that is on fire.
 *
 * Everything is clamped. A stack trace from a minified bundle can be tens
 * of kilobytes and a hostile caller could send megabytes; neither is worth
 * storing, and the first few thousand characters hold the answer.
 */
create or replace function public.note_error(
  p_session text,
  p_kind text,
  p_message text,
  p_stack text default null,
  p_where text default null,
  p_build text default null,
  p_seen integer default 1
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session is null or p_kind is null or p_message is null then return; end if;

  insert into public.app_errors (session_id, user_id, build, kind, message, stack, where_at, seen)
  values (
    left(p_session, 64),
    auth.uid(),
    left(p_build, 64),
    left(p_kind, 32),
    left(p_message, 1000),
    left(p_stack, 4000),
    left(p_where, 2000),
    greatest(1, least(coalesce(p_seen, 1), 1000))
  )
  on conflict (session_id, kind, coalesce(build, ''), md5(message)) do update
    set seen = public.app_errors.seen + greatest(1, least(coalesce(p_seen, 1), 1000)),
        last_at = now(),
        -- A later report of the same fault may carry a stack the first one
        -- did not. Never replace something with nothing.
        stack = coalesce(excluded.stack, public.app_errors.stack),
        where_at = coalesce(excluded.where_at, public.app_errors.where_at);
end;
$$;

revoke all on function public.note_error(text, text, text, text, text, text, integer) from public;
grant execute on function public.note_error(text, text, text, text, text, text, integer) to anon, authenticated;

-- ── Reading it back ───────────────────────────────────────────────────
--
-- Owner-only, so the answer to "is anything broken" is one query rather
-- than a dashboard nobody builds. Kept as functions rather than views with
-- policies, because the tables deliberately have no SELECT policy at all
-- and adding one for a view would open a door this does not need.

create or replace function public.what_is_broken(p_since interval default '7 days')
returns table (
  build text,
  kind text,
  message text,
  people bigint,
  times bigint,
  first_at timestamptz,
  last_at timestamptz,
  where_at text,
  stack text
)
language sql
security definer
set search_path = public
as $$
  select e.build, e.kind, e.message,
         count(distinct e.session_id) as people,
         sum(e.seen) as times,
         min(e.first_at) as first_at,
         max(e.last_at) as last_at,
         (array_agg(e.where_at) filter (where e.where_at is not null))[1],
         (array_agg(e.stack) filter (where e.stack is not null))[1]
  from public.app_errors e
  where e.last_at > now() - p_since
    and public.is_admin()
  group by e.build, e.kind, e.message
  order by max(e.last_at) desc;
$$;

-- Both, and the second is the one that matters. Supabase sets default
-- privileges granting EXECUTE on new functions in `public` directly to anon
-- and authenticated, and revoking from PUBLIC does not touch a direct grant
-- to a named role. Without the second line this is callable signed out —
-- harmless, because is_admin() is false and it returns nothing, but a
-- reader's only protection should never be the body of the function.
revoke all on function public.what_is_broken(interval) from public;
revoke execute on function public.what_is_broken(interval) from anon;
grant execute on function public.what_is_broken(interval) to authenticated;

comment on table public.app_errors is
  'Faults reported by the client. Written only via note_error(), read only via what_is_broken(). No RLS policies on purpose — there is no direct access of any kind.';
