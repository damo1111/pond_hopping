-- Applied to the live project (qslksdgxoibzrisywvqk) in August 2026.
-- schema.sql is the *initial* schema and still shows the old
-- "anon can do anything" policies; this file is what actually superseded
-- them. Kept as a record — re-running it wholesale is not intended.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Visibility: public-ness and membership become separate axes
-- ─────────────────────────────────────────────────────────────────────
-- trip_is_private(t) used to mean "does this trip have any members", so
-- owning a trip and showing it off were mutually exclusive: the moment
-- David was recorded as a member, the trip vanished for everyone else.

alter table public.trips add column is_public boolean not null default false;

create or replace function public.trip_is_visible(t uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from trips where id = t and is_public)
      or public.is_trip_member(t)
$$;

-- SELECT policies on trips, planned_events, plan_chat_threads and
-- plan_chat_messages swapped from trip_is_private to trip_is_visible.
-- Write policies still use trip_is_private/is_trip_editor.

-- Confirmed history is public (the signed-out showreel); drafts are not.
update public.trips set is_public = true where status = 'confirmed';

-- David owns every trip that had no owner, so "private" can mean something
-- without him losing sight of his own history.

-- ─────────────────────────────────────────────────────────────────────
-- 2. Participants: who did what on a shared trip
-- ─────────────────────────────────────────────────────────────────────
-- Null = the whole party, which is what every pre-existing solo row
-- already means, so nothing needed backfilling.

alter table public.flights         add column traveler text;
alter table public.planned_events  add column traveler text;
alter table public.journal_entries add column traveler text;
alter table public.photos          add column traveler text;
alter table public.costs           add column traveler text;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Notes: the missing middle tier
-- ─────────────────────────────────────────────────────────────────────
-- private_notes had no author column, so "private" notes were pooled
-- across everyone on a trip — and the RLS policy let anyone on the
-- internet read all of them. Now: private (author only) / shared (trip
-- members, never on a public share link) / public (journal_entries).

alter table public.private_notes add column author text;
alter table public.private_notes add column visibility text not null default 'private'
  check (visibility in ('private','shared'));
update public.private_notes set visibility = 'shared' where author is null;

-- One note per day per *person*, not per trip, or two people silently
-- overwrite each other on upsert.
alter table public.private_notes drop constraint private_notes_trip_id_note_date_key;
alter table public.private_notes
  add constraint private_notes_trip_date_author_key
  unique nulls not distinct (trip_id, note_date, author);

-- ─────────────────────────────────────────────────────────────────────
-- 4. Connector auth: tokens for calendar feeds and MCP clients
-- ─────────────────────────────────────────────────────────────────────
-- Calendar apps and AI assistants can't hold a Supabase session. No
-- service-role key is configured anywhere, so rather than introducing one,
-- authentication AND authorisation both happen inside SECURITY DEFINER
-- functions keyed on an opaque token. Nothing elevated leaves the database.

create table public.api_tokens (
  token uuid primary key default gen_random_uuid(),
  email text not null,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.api_tokens enable row level security;  -- no policies: service role only

-- my_api_token()          — a signed-in person mints/reads their own
-- api_token_email(t)      — resolve a token, touch last_used_at
-- api_calendar_feed(t)    — everything the ICS feed needs
-- api_list_trips(t)       — MCP: list
-- api_get_trip(t, slug)   — MCP: detail
-- api_stats(t)            — MCP: totals
-- api_create_trip(...)    — MCP: write
-- api_add_events(...)     — MCP: write, editors only
-- All return null for an unknown token rather than erroring, so probing
-- can't distinguish "wrong token" from "no data".

-- ─────────────────────────────────────────────────────────────────────
-- 5. Closing the read/delete holes on content tables
-- ─────────────────────────────────────────────────────────────────────
-- Every content table was readable AND deletable by anyone holding the
-- publishable key, which ships in the client bundle. Nothing in the app
-- deletes from these tables, so those policies were pure liability.
-- Reads now follow trip visibility; deletes require being a trip editor.
--
-- STILL OPEN: INSERT/UPDATE remain anon-permissive on these tables,
-- because api/resize-photo.js and api/inbound-email.js write with the anon
-- key. Tightening those requires reworking both to go through SECURITY
-- DEFINER functions first.

do $$
declare tbl text;
begin
  foreach tbl in array array['flights','journal_entries','photos','costs',
                             'map_pins','runs','day_tracks','photo_cache','trip_summaries']
  loop
    execute format('drop policy if exists %I on public.%I', 'anon del ' || tbl, tbl);
    execute format('drop policy if exists %I on public.%I', 'anon read ' || tbl, tbl);
    execute format(
      'create policy %I on public.%I for select using (trip_id is null or public.trip_is_visible(trip_id))',
      'read ' || tbl || ' of visible trips', tbl
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. Inbound email import
-- ─────────────────────────────────────────────────────────────────────
create table public.email_imports (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  from_address text,
  subject text,
  raw_text text,
  items jsonb not null default '[]'::jsonb,
  matched_trip_id uuid references public.trips(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now()
);
