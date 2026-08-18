-- The public demos had no photographs in them.
--
-- RLS on trips is `is_public OR owner_id = auth.uid() OR is_trip_member(id)`,
-- so a signed-out visitor sees exactly the demos marked public. Measured:
-- china-japan-example held 0 photographs and demo-portugal held 0. The 1,998
-- China & Japan pictures are on china-japan, which is the real trip and is
-- private. rome-example did have a curated 103-photograph copy and was not
-- public, so nobody outside the account had ever seen it.
--
-- Rome goes public. It was built as a demo copy and simply never flipped.
--
-- China & Japan gets a hundred: ten a day across 21–30 May, spread through
-- each day rather than taken from the front of it, because the day cards are
-- built out of the gaps between photographs and a morning's worth of one
-- breakfast is not a day.
--
-- Ten days, not sixteen. The vision pass (`seen`) ran on 21–30 May and
-- stopped, so those are the only days where captions and day summaries fill
-- in; the rest would be a grid of pictures with nothing said about them.
-- 97 of the hundred carry it.
--
-- None of them carries a location, and that is not a fault here: the Google
-- Photos Picker API does not return GPS, so every one of the 1,998 arrived
-- without it. The map tab for this trip stays empty until that is solved
-- separately. Photographs, days and the look-back all work regardless —
-- dayShape.segment() reads time first and distance only as a coarse check.
--
-- Left private at the end on purpose. A copy into a public trip is a
-- publish, and these are real photographs of a real holiday, so the
-- selection is reviewed in the app before the trip goes back on the globe.
update trips set is_public = true  where slug = 'rome-example';
update trips set is_public = false where slug = 'china-japan-example';

with src as (
  select p.*,
         row_number() over (partition by p.taken_on order by p.taken_at) as n,
         count(*)     over (partition by p.taken_on)                     as of_day
  from photos p
  where p.trip_id = (select id from trips where slug='china-japan')
    and p.taken_on between '2026-05-21' and '2026-05-30'
    and coalesce(p.kind,'photo') = 'photo'
),
chosen as (
  select * from src
  where ((n - 1) * 10) / of_day <> ((n - 2) * 10) / of_day or n = 1
)
insert into photos (
  trip_id, url, thumb_url, original_url, caption, city, taken_on, taken_at,
  lat, lon, kind, is_reel, is_highlight, traveler, phash,
  seen, seen_at, seen_detail, fingerprint
)
select
  (select id from trips where slug='china-japan-example'),
  url, thumb_url, original_url, caption, city, taken_on, taken_at,
  lat, lon, kind, is_reel,
  -- One lead per day, so every day card has a picture on it.
  (row_number() over (partition by taken_on order by taken_at) = 5),
  traveler, phash,
  seen, seen_at, seen_detail, fingerprint
from chosen;
