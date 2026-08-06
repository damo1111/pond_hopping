-- ============================================================
-- A trip belongs to whoever made it; costs follow the trip
--
-- Applied to production 2026-08-06.
-- ============================================================

-- ── 1. Creating a trip produced a trip you could not see ──────────────────
--
-- trips.is_public defaults to false, trip_is_visible is (is_public OR
-- is_trip_member), and nothing anywhere added the creator as a member —
-- trip_members was only ever written by the email-import flow. So a new trip
-- was invisible to its own author the instant it existed.
--
-- In the app that surfaces as nothing happening at all: PlanTab.promote()
-- does .insert().select().single(), the RETURNING is blocked by the SELECT
-- policy, the call comes back an error, and the code silently gives up. A
-- dead button and an orphan row.
--
-- Verified as the authenticated role before writing this: the insert lands,
-- and selecting the row back returns 0.
create or replace function public.claim_new_trip()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  who text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if who <> '' then
    insert into public.trip_members (trip_id, email, role, is_traveller)
    values (new.id, who, 'owner', true)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists claim_new_trip on public.trips;
create trigger claim_new_trip
  after insert on public.trips
  for each row execute function public.claim_new_trip();

-- An anonymous visitor has no email, so the trigger cannot give them
-- ownership, so their trip would be orphaned by construction. "You need an
-- account to make a trip" is a sentence the app can say; a silently discarded
-- trip is not.
drop policy if exists "anon write trips" on public.trips;
create policy "signed-in visitors create trips" on public.trips for insert
  with check (coalesce(auth.jwt() ->> 'email', '') <> '');

drop policy if exists "anon write wishlist_items" on public.wishlist_items;
create policy "signed-in visitors add ideas" on public.wishlist_items for insert
  with check (coalesce(auth.jwt() ->> 'email', '') <> '');

-- ── 2. Costs follow the trip again ────────────────────────────────────────
--
-- Earlier today I pulled costs back to members-only, reasoning that money is
-- the same category of thing as a private note. Wrong call: the point of
-- publishing a demo trip is to demonstrate the app, and what a trip cost is
-- one of the things the app is for. Every trip is private by default, so this
-- exposes the 29 rows on the published demo and nothing else.
drop policy if exists "read costs of visible trips" on public.costs;
create policy "read costs of visible trips" on public.costs for select using (
  (trip_id is not null and public.trip_is_visible(trip_id))
  or (trip_id is null and public.is_known_traveller())
);

-- ── Verified after applying ───────────────────────────────────────────────
--
--   anon: 1 trip on Home, 29 costs (A$4,125 — the demo's), 0 private notes
--   anon INSERT into trips: refused
--   authenticated INSERT: row visible to its creator, one owner row created
