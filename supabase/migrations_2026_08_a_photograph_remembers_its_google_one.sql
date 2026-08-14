-- Google's own id for a picked photograph. The only way to recognise one we
-- already hold *before* fetching it: a fingerprint is a digest of the first
-- quarter-megabyte and a timestamp comes off the EXIF inside, so both need
-- the bytes. Without this, skipping nine hundred photographs on a re-import
-- would mean downloading nine hundred photographs to discover we could.
alter table public.photos add column if not exists google_id text;

-- Partial, because only imported rows have one and the phone route never
-- will. Scoped per trip rather than globally: the same photograph genuinely
-- belongs to two trips sometimes, and a hard global unique would refuse the
-- second one.
create unique index if not exists photos_google_id_per_trip
  on public.photos (trip_id, google_id)
  where google_id is not null;
