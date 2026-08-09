-- Lounges, in the three layers docs/lounges.md argues for. Kept apart on
-- purpose: they have different lifetimes, different trust, and different
-- update cadences, and one table for all three makes all three unmaintainable.

-- LAYER 1 — stable. Where it is. Changes a few times a year.
create table if not exists lounges (
  id uuid primary key default gen_random_uuid(),
  airport text not null,                       -- IATA, e.g. LHR
  terminal text,                               -- as printed, e.g. "3"
  airside boolean not null default true,       -- landside lounges need saying
  name text not null,
  operator text,                               -- who runs it, e.g. Cathay Pacific
  alliance text,                               -- oneworld | staralliance | skyteam | null
  where_exactly text,                          -- "after security, level 2, turn left"
  hours jsonb,                                 -- { mon: ["05:30","22:00"], ... }
  amenities text[] default '{}',
  -- Editorial. This is the product: 1 is "go here".
  rank int,
  editorial_note text,
  -- Lounge data rots. Staleness has to be visible in the schema or the
  -- whole thing quietly becomes wrong.
  verified_at timestamptz,
  source_url text,
  created_at timestamptz not null default now()
);
create index if not exists lounges_airport_idx on lounges (airport, terminal);

-- One lounge per name per terminal. Without this the seed is not safe to
-- re-run and an importer can quietly double the dataset.
create unique index if not exists lounges_place_idx
  on lounges (airport, coalesce(terminal, ''), name);

-- LAYER 1b — who gets in, as rules rather than a flag.
--
-- The Qantas London Lounge is reachable by oneworld Emerald, by Sapphire, by
-- a business ticket, by Qantas Club membership, and sometimes by paying:
-- five independent routes to one door. One row each, so eligibility is a
-- filter and every answer can explain how you got in.
create table if not exists lounge_access (
  id uuid primary key default gen_random_uuid(),
  lounge_id uuid not null references lounges (id) on delete cascade,
  via text not null,          -- alliance_tier | cabin | programme | priority_pass | card | paid
  alliance text,
  tier text,                  -- emerald | sapphire | ruby | gold | silver
  cabin text,                 -- first | business
  programme text,             -- "Qantas Club", "Hilton Honors"
  airline text,               -- when access depends on the airline flown
  same_alliance_flight boolean not null default false,
  guests int not null default 0,
  price text,                 -- for via = paid
  note text
);
create index if not exists lounge_access_lounge_idx on lounge_access (lounge_id);

-- LAYER 2 — volatile. What is true this week.
--
-- David at LHR T3: Emerald, default is the Cathay First lounge, and during
-- Middle East disruption Cathay limited entry to their own passengers. Every
-- stable fact was correct and the answer was still useless.
create table if not exists lounge_conditions (
  id uuid primary key default gen_random_uuid(),
  lounge_id uuid not null references lounges (id) on delete cascade,
  kind text not null,         -- closed | access_restricted | capacity | refurbishment | hours
  summary text not null,      -- shown to a Pond Hopper, one line
  detail text,
  -- Restricted to these, when kind = access_restricted. Cathay's case is
  -- airlines = {CX}: eligible by tier, still not getting in on Finnair.
  airlines text[],
  starts_at timestamptz not null default now(),
  ends_at timestamptz,        -- null = open-ended, which is what decays
  source_type text not null default 'member_report',  -- official | published | member_report
  source_url text,
  reported_by text,
  confirmations int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists lounge_conditions_lounge_idx on lounge_conditions (lounge_id, starts_at desc);

-- LAYER 3 — subjective. What is actually good.
create table if not exists lounge_tips (
  id uuid primary key default gen_random_uuid(),
  lounge_id uuid not null references lounges (id) on delete cascade,
  category text,              -- seat | food | shower | quiet | wifi | view | timing
  tip text not null,
  author text,                -- attributed, never asserted
  source_type text not null default 'member_report',
  source_url text,
  created_at timestamptz not null default now()
);
create index if not exists lounge_tips_lounge_idx on lounge_tips (lounge_id);

-- The flywheel. Someone standing there at 09:00 finding it shut.
--
-- One report flags, two independent reports confirm — a single bad morning
-- must not overwrite the canonical value globally. flight_event_id is the
-- verification nobody else has: a report backed by a boarding pass for that
-- airport that morning is worth ten anonymous ones.
create table if not exists lounge_reports (
  id uuid primary key default gen_random_uuid(),
  lounge_id uuid not null references lounges (id) on delete cascade,
  field text not null,        -- hours | closed | access | location | amenity | tip
  observed text not null,
  observed_at timestamptz not null default now(),
  reporter_email text,
  flight_event_id uuid references planned_events (id) on delete set null,
  status text not null default 'pending',   -- pending | confirmed | rejected
  created_at timestamptz not null default now()
);
create index if not exists lounge_reports_lounge_idx on lounge_reports (lounge_id, status);

-- Reference data everyone can read; only the people who were there can add
-- to it, and nobody edits the canonical rows from the client.
alter table lounges enable row level security;
alter table lounge_access enable row level security;
alter table lounge_conditions enable row level security;
alter table lounge_tips enable row level security;
alter table lounge_reports enable row level security;

create policy "lounges are public" on lounges for select using (true);
create policy "access rules are public" on lounge_access for select using (true);
create policy "conditions are public" on lounge_conditions for select using (true);
create policy "tips are public" on lounge_tips for select using (true);

create policy "signed-in pond hoppers report" on lounge_reports
  for insert to authenticated with check (true);
create policy "read your own reports" on lounge_reports
  for select to authenticated using (is_my_address(reporter_email));
