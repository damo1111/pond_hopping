-- ============================================================
-- HK & South Korea becomes the shopfront
--
-- Applied to production 2026-08-06, on top of migrations_2026_08_private_by_default.sql.
-- ============================================================

-- One public trip, chosen on the numbers — 181 photos, 5 runs, 9 entries,
-- the best-looking thing in the log — and checked before publishing: no
-- private notes are attached to it, and the entries are runs, airports and
-- subway lines with no names or addresses in them.
update public.trips set is_public = true where slug = 'south-korea';

-- Publishing a trip should not publish what it cost.
--
-- Costs were riding on trip visibility, so the 29 rows on this trip would
-- have gone public with it and been readable from Useful > Costs. Money
-- belongs in the same category as a private note, which has always been
-- member-only rather than visibility-gated. This is that rule applied to the
-- other thing nobody publishes on purpose — and it closes the same hole for
-- every future public trip, not just this one.
--
-- Nothing in the UI reads costs except the Costs tab, so the change is
-- invisible to a member and total.
drop policy if exists "read costs of visible trips" on public.costs;
create policy "read costs of visible trips" on public.costs for select using (
  (trip_id is not null and public.is_trip_member(trip_id))
  or (trip_id is null and public.is_known_traveller())
);

-- ── Verified against both callers after applying ──────────────────────────
--
--          trip_meta  trips  journal  photos  runs  flights  costs  notes
--   anon           1      2        9     181     5        4      0      0
--   owner         14     17       99     504    68      475    213     18
--
-- anon's second trips row is the Lisbon planning demo, which is a draft and
-- so is not in trip_meta.
