-- Where the full-size file lives, when one was kept.
-- Applied to production 10 Aug 2026; kept here as the record.
--
-- The app uploads two renders of every photograph — 2048px for display and
-- 400px for grids — and the original never leaves the phone. That is the
-- right trade on hotel wifi, and it means Pond Hopping is not a backup: a
-- lost phone is lost originals.
--
-- Null for every row that exists today and for every upload that does not
-- ask for it, so nothing about the current behaviour changes. The display
-- copy stays what the app shows; this is only for keeping.
alter table photos add column if not exists original_url text;

comment on column photos.original_url is
  'Full-size file, when the uploader was asked to keep one. Never used for display — url and thumb_url are.';
