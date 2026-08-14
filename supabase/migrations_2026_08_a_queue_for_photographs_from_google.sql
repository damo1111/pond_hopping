-- Bringing a trip's photographs in from Google, by nobody in particular.
--
-- The obvious shape is for the app to hold the list and call the server a
-- hundred and twenty-five times, eight at a time. Simpler, gives a live
-- progress bar, and does not survive contact with a phone: a thousand
-- photographs is fifteen minutes, and the moment the screen locks or
-- somebody switches apps, mobile browsers suspend the tab. The import would
-- not fail, it would stop, silently, half done.
--
-- So the record of where things got to lives here, and pg_cron turns the
-- handle — exactly as story_runs already does. Same secret, same shape, same
-- fifteen-minute takeover of a run gone quiet.
--
-- THE TOKEN. photo_imports holds a Google access token for the life of the
-- run. A credential at rest, and worth being honest about. Two things make
-- it acceptable: it is worthless in about an hour, and the photospicker
-- scope cannot list a library — it reads only the items picked in that one
-- session. No refresh token is stored, deliberately: that would be a
-- long-lived key to every photograph the person owns.
--
-- The full definitions of start_photo_import, photo_import_progress,
-- photo_import_batch, photo_import_settled, photo_import_finished,
-- photo_import_store, photo_imports_waiting and tick_photo_imports are
-- applied in the project as migrations 20260813230339 and 20260813230414.
-- This file records the tables and the shape; regenerate the functions with
-- `supabase db pull` if this ever needs to be replayed from scratch.

create table if not exists public.photo_imports (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  asked_by      uuid references auth.users(id) on delete set null,
  token         text,
  token_dies_at timestamptz,
  started_at    timestamptz not null default now(),
  tick_at       timestamptz,
  finished_at   timestamptz,
  note          text
);

create table if not exists public.photo_import_items (
  id            uuid primary key default gen_random_uuid(),
  import_id     uuid not null references public.photo_imports(id) on delete cascade,
  google_id     text not null,
  -- Expires with the token. Never stored as a photograph's url.
  fetch_from    text not null,
  -- The permanent one — where "open in Google Photos" points.
  product_url   text,
  taken_at_hint timestamptz,
  state         text not null default 'waiting'
                check (state in ('waiting','done','skipped','failed')),
  note          text,
  settled_at    timestamptz
);

create index if not exists photo_import_items_waiting
  on public.photo_import_items (import_id) where state = 'waiting';
create unique index if not exists photo_import_items_once
  on public.photo_import_items (import_id, google_id);

-- No policies on purpose. Every function that touches these is SECURITY
-- DEFINER and takes either the worker's secret or goes through
-- is_trip_editor(), so there is no path to somebody else's token through
-- the REST API at all.
alter table public.photo_imports enable row level security;
alter table public.photo_import_items enable row level security;

-- select cron.schedule('photo-imports', '* * * * *', 'select public.tick_photo_imports()');
