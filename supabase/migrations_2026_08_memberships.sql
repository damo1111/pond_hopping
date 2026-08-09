-- What somebody holds: airline status, lounge networks, hotel programmes.
--
-- A list rather than columns on profiles, because people hold several and
-- the set changes. Asked one at a time at the moment it pays off — the first
-- BA flight imported asks about Executive Club — never as a form.
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,                 -- airline | lounge_network | hotel
  programme text not null,            -- "British Airways Executive Club", "Priority Pass"
  alliance text,                      -- oneworld | staralliance | skyteam
  tier text,                          -- emerald | sapphire | prestige | standard_plus
  membership_number text,

  -- Lounge networks only, and the reason this table exists rather than a
  -- boolean. Priority Pass Standard includes no visits and charges about £32
  -- a time; Standard Plus includes ten; Prestige is unlimited. Telling all
  -- three "you can get in" is true and useless — the eleventh visit costs
  -- money, and somebody choosing between a lounge and a bar should know
  -- before they walk over.
  unlimited_visits boolean not null default false,
  visits_included int,                -- null = unknown, which is not unlimited
  visits_used int not null default 0,
  visits_reset_on date,
  visit_fee text,                     -- what the next one costs, as printed

  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, programme)
);
create index if not exists memberships_user_idx on memberships (user_id, kind);

alter table memberships enable row level security;

-- Yours and nobody else's. A membership number is as good as a boarding pass
-- at some desks, so this never leaves the row it belongs to.
create policy "read your own memberships" on memberships
  for select to authenticated using (auth.uid() = user_id);
create policy "add your own memberships" on memberships
  for insert to authenticated with check (auth.uid() = user_id);
create policy "change your own memberships" on memberships
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete your own memberships" on memberships
  for delete to authenticated using (auth.uid() = user_id);

-- Lounge networks are not one thing. Priority Pass, LoungeKey, Mastercard
-- Airport Experiences and DragonPass have different lounge lists, and
-- folding them into one flag hands somebody a confidently wrong answer at
-- the door.
update lounge_access
set via = 'network', programme = 'Priority Pass'
where via = 'priority_pass';
