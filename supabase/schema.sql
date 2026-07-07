-- ============================================================
-- NOT THAT CVNVRD — schema
-- Personal travel app, single user, client-only via anon key.
-- ============================================================

create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  subtitle     text,
  start_date   date,
  end_date     date,
  countries    text[] default '{}',          -- flag emojis for the card grid
  cover_photo_url text,
  photos_url   text,                          -- Google Photos album share URL
  sort_order   int default 0,
  created_at   timestamptz default now()
);

create table public.aircraft_types (
  id           uuid primary key default gen_random_uuid(),
  icao         text unique not null,          -- e.g. 'B789'
  name         text not null,                 -- e.g. 'Boeing 787-9 Dreamliner'
  manufacturer text,
  notes        text
);

create table public.flights (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid references public.trips(id) on delete cascade,
  flight_number  text,                        -- e.g. 'QF35'
  airline        text,
  dep_airport    text,                        -- IATA, e.g. 'MEL'
  dep_city       text,
  dep_lat        double precision,
  dep_lon        double precision,
  arr_airport    text,
  arr_city       text,
  arr_lat        double precision,
  arr_lon        double precision,
  dep_time       timestamptz,
  arr_time       timestamptz,
  aircraft_type_id uuid references public.aircraft_types(id),
  registration   text,                        -- e.g. 'VH-ZNA' → Planespotters photos
  cabin          text,
  seat           text,
  config         text,                        -- cabin config note, e.g. '3-3-3'
  distance_km    int,
  notes          text,
  sort_order     int default 0,
  created_at     timestamptz default now()
);

create table public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid references public.trips(id) on delete cascade,
  entry_date  date not null,
  day_number  int,
  city        text,
  title       text not null,
  note        text,
  mood        text,                           -- emoji
  tags        text[] default '{}',
  lat         double precision,
  lon         double precision,
  created_at  timestamptz default now()
);

create table public.photos (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid references public.trips(id) on delete cascade,
  url          text not null,                 -- direct image URL, no uploads
  caption      text,
  city         text,
  taken_on     date,
  is_reel      boolean default false,
  is_highlight boolean default false,
  created_at   timestamptz default now()
);

create table public.costs (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid references public.trips(id) on delete cascade,
  description text not null,
  amount      numeric(12,2) not null,
  currency    text not null default 'AUD'
              check (currency in ('AUD','KRW','HKD','JPY','CNY','USD','GBP','LKR','NZD','THB','SGD','MYR')),
  amount_aud  numeric(12,2),                  -- converted at entry time
  category    text not null default 'Other'
              check (category in ('Food','Transport','Shopping','Hotel','Activity','Flight','Other')),
  city        text,
  spent_on    date default now(),
  created_at  timestamptz default now()
);

create table public.map_pins (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid references public.trips(id) on delete cascade,
  kind       text not null default 'place'
             check (kind in ('place','hotel','run','highlight')),
  label      text not null,
  city       text,
  lat        double precision not null,
  lon        double precision not null,
  notes      text,
  created_at timestamptz default now()
);

-- GPS-tracked runs (merged in from the asia_runs app)
create table public.runs (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid references public.trips(id) on delete cascade,
  run_date     date,
  label        text not null,
  city         text,
  distance_km  numeric(6,2),
  pace         text,                          -- e.g. '5:08/km'
  hr_avg       int,
  hr_max       int,
  elevation_m  int,
  color        text,                          -- route colour on the map
  coords       jsonb not null,                -- [[lat, lon], …]
  created_at   timestamptz default now()
);

create table public.phrases (
  id         uuid primary key default gen_random_uuid(),
  country    text not null check (country in ('KR','HK')),
  category   text not null,
  english    text not null,
  local      text not null,                   -- native script — copied to clipboard
  romanized  text,
  sort_order int default 0
);

-- ── trip_meta: the single fetch the app shell makes on boot ──
create or replace view public.trip_meta as
select
  t.id,
  t.slug,
  t.title,
  t.subtitle,
  t.start_date,
  t.end_date,
  t.countries,
  t.cover_photo_url,
  t.photos_url,
  t.sort_order,
  (select count(*) from public.flights f where f.trip_id = t.id)          as flight_count,
  (select count(*) from public.journal_entries j where j.trip_id = t.id)  as journal_count,
  (select count(*) from public.photos p where p.trip_id = t.id)           as photo_count,
  (select count(*) from public.runs r where r.trip_id = t.id)             as run_count,
  (select coalesce(sum(c.amount_aud), 0) from public.costs c where c.trip_id = t.id) as total_aud
from public.trips t;

alter view public.trip_meta set (security_invoker = true);

-- ── RLS ───────────────────────────────────────────────────────
-- Single-user personal app, client-only via the anon key (a key
-- decision in CLAUDE.md). RLS is enabled with permissive anon
-- policies so the tables aren't wide open to schema changes, and
-- so per-table rules can tighten later without app changes.

alter table public.trips           enable row level security;
alter table public.aircraft_types  enable row level security;
alter table public.flights         enable row level security;
alter table public.journal_entries enable row level security;
alter table public.photos          enable row level security;
alter table public.costs           enable row level security;
alter table public.map_pins        enable row level security;
alter table public.runs            enable row level security;
alter table public.phrases         enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'trips','aircraft_types','flights','journal_entries',
    'photos','costs','map_pins','runs','phrases'
  ]
  loop
    execute format('create policy "anon read %1$s"  on public.%1$I for select using (true)', t);
    execute format('create policy "anon write %1$s" on public.%1$I for insert with check (true)', t);
    execute format('create policy "anon edit %1$s"  on public.%1$I for update using (true) with check (true)', t);
    execute format('create policy "anon del %1$s"   on public.%1$I for delete using (true)', t);
  end loop;
end $$;
