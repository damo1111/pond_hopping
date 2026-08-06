-- ============================================================
-- Trips know when they are a demo
--
-- Applied to production 2026-08-06.
-- ============================================================

-- The app needs to say "this is an example, not yours" on the shopfront trip,
-- and to stop saying it the moment someone has a trip of their own. That is a
-- property of the trip, not a slug for the client to carry in a constant —
-- the demo will change, and a hardcoded 'south-korea' would then be a lie in
-- two places at once.
alter table public.trips add column if not exists is_demo boolean not null default false;

update public.trips set is_demo = true where slug in ('south-korea', 'demo-portugal');

-- Home reads trip_meta, so the flag has to come through it. Recreated rather
-- than altered because Postgres will not add a column to an existing view.
--
-- security_invoker is re-declared deliberately: a replace resets reloptions,
-- and losing it would silently unpick the whole private-by-default change —
-- the view would go back to reading as its owner and hand every trip to
-- everyone. That is the single most dangerous line in this file.
drop view if exists public.trip_meta;

create view public.trip_meta
with (security_invoker = true)
as
select
  id, slug, title, subtitle, start_date, end_date, countries,
  cover_photo_url, photos_url, sort_order,
  (select count(*) from flights f where f.trip_id = t.id) as flight_count,
  (select count(*) from journal_entries j where j.trip_id = t.id) as journal_count,
  (select count(*) from photos p where p.trip_id = t.id) as photo_count,
  (select count(*) from runs r where r.trip_id = t.id) as run_count,
  (select coalesce(sum(c.amount_aud), 0::numeric) from costs c where c.trip_id = t.id) as total_aud,
  chapter,
  is_demo
from trips t
where status = 'confirmed'::text;

grant select on public.trip_meta to anon, authenticated;

-- ── Re-verified after recreating the view ─────────────────────────────────
--
--   anon    1 row  (HK & South Korea, is_demo true)
--   owner  14 rows (1 of them a demo)
