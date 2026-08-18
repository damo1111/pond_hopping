-- The same file, on two trips.
--
-- photos_url_key was UNIQUE (url), across the whole table. Which reads as
-- "no photograph twice" and means something stronger and wrong: no
-- photograph on two trips, ever, because the row carries the storage URL and
-- two rows pointing at one object collide.
--
-- That forbids the demo copies. china-japan-example is meant to be a curated
-- cut of china-japan and rome-example is a curated cut of rome-2024 — the
-- same files, a smaller selection, a trip that can be made public without
-- publishing the original. Rome's copy exists because it was seeded before
-- this index did; China & Japan's could not be made at all, which is why the
-- public past demo has been sitting there with no photographs in it. A cold
-- visitor therefore saw no photo grid, no day segments, no map pins and no
-- look-back — every photograph feature the app has, invisible, on the demo
-- built to show the app off.
--
-- It also forbids the honest case this app meets properly later: two people
-- on one trip, or a trip shared onward, where the same photograph
-- legitimately belongs in two places.
--
-- Every other identity on this table is already per trip:
--
--   photos_google_id_per_trip   UNIQUE (trip_id, google_id)
--   photos_fingerprint          INDEX  (trip_id, fingerprint)
--
-- and the duplicate rules in alreadyHere.js are written per trip throughout.
-- This index was the one that disagreed.
--
-- Nothing upserts on url — checked across src/ and api/, where every
-- on_conflict names something else — so nothing depends on the global
-- version of the guarantee.
--
-- NULLS NOT DISTINCT keeps the guarantee where it still bites: a photograph
-- with no trip yet is the upload queue, and two identical rows there would
-- be a genuine double-insert rather than a copy.
drop index if exists public.photos_url_key;

create unique index photos_url_per_trip
  on public.photos (trip_id, url) nulls not distinct;
