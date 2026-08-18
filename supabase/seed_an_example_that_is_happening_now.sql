-- One example is always in the middle of happening.
--
-- Home sorts trips into Right now / Coming up / Been there, and a cold
-- visitor met two of the three. "Right now" — the state this app is actually
-- for, the one where the log fills itself in while you are away — never
-- appeared, because no demo was ever in it.
--
-- Thailand, because of what its photographs carry: 264 of them across nine
-- days, 196 with a location. China & Japan has none — the Google Photos
-- Picker API does not return GPS — so a live demo built from that would have
-- an empty map on the one trip somebody is looking at to see what the app
-- does. Rome has locations but is already the past example.
--
-- ── The shape ────────────────────────────────────────────────────────────
--
-- Ten days, and today is day six. Five days behind to look back at, four
-- ahead to be booked for.
--
-- Today's photographs stop at two in the afternoon. A day you are living
-- has an afternoon still to come, and a full day of pictures on a day that
-- is half over is the one detail that gives the whole thing away. Because
-- the job below shifts by whole days, that stays true tomorrow.
--
-- Today's itinerary is one thing done and two to come, for the same reason.
--
-- Ten days rather than eleven because both examples are pinned to today —
-- Lisbon five days ahead, this one ending five days ahead — so at eleven
-- their ends touched every day for ever: the same traveller landing at
-- Heathrow at 07:00 and leaving it at 07:55 the same morning.
--
-- ── is_demo cannot be set from here ──────────────────────────────────────
--
-- guard_new_is_demo does `new.is_demo := false` for anybody who is not
-- is_admin(), and a migration has no JWT. Silently — the insert succeeds and
-- the flag is simply not what was asked for, so the trip exists and is
-- missing from every query that filters on is_demo, with nothing having
-- failed anywhere. See migrations_2026_08_the_underway_example_is_a_demo.sql,
-- which stands the guard down for one statement on one row. The guard is
-- right and stays; the next demo trip should have to come through there too.
insert into trips (slug, title, subtitle, start_date, end_date, countries, status,
                   sort_order, is_demo, is_public, owner_id)
values (
  'demo-thailand-now',
  'Thailand 🇹🇭',
  'Ten days · Bangkok, Ayutthaya and the Andaman coast',
  current_date - 5,
  current_date + 4,
  array['🇹🇭'],
  'confirmed',
  98,
  true,   -- refused by guard_new_is_demo; see above
  false,  -- private until the photographs have been looked at
  '443aded3-fcbb-44dd-8ad7-643c52931bef'
)
on conflict (slug) do update
  set start_date = excluded.start_date, end_date = excluded.end_date;

-- The days behind you, and the part of today that has happened.
with day_map(src, offset_days) as (
  values ('2026-04-03'::date, -5), ('2026-04-04'::date, -4), ('2026-04-05'::date, -3),
         ('2026-04-06'::date, -2), ('2026-04-07'::date, -1), ('2026-04-08'::date, 0)
),
src as (
  select p.*, m.offset_days,
         row_number() over (partition by p.taken_on order by p.taken_at) as n,
         count(*)     over (partition by p.taken_on)                     as of_day
  from photos p
  join day_map m on m.src = p.taken_on
  where p.trip_id = (select id from trips where slug='bangkok')
    and coalesce(p.kind,'photo') = 'photo'
    and (m.offset_days < 0 or p.taken_at::time < time '14:00')
),
-- Ten a day at most, spread through the day rather than taken off the front:
-- the day cards are built out of the gaps between photographs, so a morning's
-- worth of one breakfast is not a day.
chosen as (
  select * from src
  where ((n - 1) * 10) / of_day <> ((n - 2) * 10) / of_day or n = 1
)
insert into photos (
  trip_id, url, thumb_url, original_url, caption, city, taken_on, taken_at,
  lat, lon, kind, is_reel, is_highlight, traveler, phash, seen, seen_at, seen_detail, fingerprint
)
select
  (select id from trips where slug='demo-thailand-now'),
  url, thumb_url, original_url, caption, city,
  current_date + offset_days,
  taken_at + make_interval(days => (current_date + offset_days) - taken_on),
  lat, lon, kind, is_reel,
  (row_number() over (partition by taken_on order by taken_at) = 3),
  traveler, phash, seen, seen_at, seen_detail, fingerprint
from chosen;

-- The itinerary. The full detail on the flights so the span card has both
-- ends, a duration, terminals and gates — arr_date on BA9 because it leaves
-- London at 21:35 and lands the next afternoon, and without it the card
-- computes a negative span and shows no duration at all on the longest leg.
with t as (select id, start_date as d from trips where slug='demo-thailand-now')
insert into planned_events (trip_id, event_date, end_date, title, note, city, kind, done, start_time, sort_order, detail)
select t.id, v.* from t, lateral (values
  (t.d,     (t.d + 4)::date, 'Hotel — The Siam, Bangkok', null, 'Bangkok', 'hotel', true, '15:00', 20,
   '{"nights":4,"room":"Riverside Suite","address":"3/2 Thanon Khao, Vachirapayabal","breakfast":true,"confirmation":"TS-2026-4471"}'::jsonb),
  (t.d + 1, null, 'Grand Palace and Wat Pho', 'Go early — it is unbearable by eleven.', 'Bangkok', 'activity', true, '08:00', 30, '{}'::jsonb),
  (t.d + 2, null, 'Ayutthaya, by train from Hua Lamphong', null, 'Ayutthaya', 'activity', true, '07:20', 40, '{}'::jsonb),
  (t.d + 3, null, 'Chatuchak weekend market', null, 'Bangkok', 'activity', true, '10:00', 50, '{}'::jsonb),
  (t.d + 4, null, 'Thonburi canals by longtail', null, 'Bangkok', 'activity', true, '16:00', 60, '{}'::jsonb),
  -- Today: one done, two to come.
  (t.d + 5, null, 'Jim Thompson House', null, 'Bangkok', 'activity', true, '10:00', 70, '{}'::jsonb),
  (t.d + 5, null, 'Massage at Wat Pho', 'Booked. Ask for the hour, not the half.', 'Bangkok', 'activity', false, '15:30', 80, '{}'::jsonb),
  (t.d + 5, null, 'Dinner — Jay Fai', 'No booking. Queue from six.', 'Bangkok', 'activity', false, '19:30', 90, '{}'::jsonb),
  (t.d + 6, (t.d + 8)::date, 'Hotel — Rayavadee, Railay', null, 'Krabi', 'hotel', false, '14:00', 110,
   '{"nights":3,"room":"Deluxe Pavilion","address":"214 Moo 2, Ao Nang","breakfast":true,"confirmation":"RV-88213"}'::jsonb),
  (t.d + 7, null, 'Longtail to Phra Nang beach', null, 'Krabi', 'activity', false, '09:30', 120, '{}'::jsonb),
  (t.d + 8, null, 'Four Islands day trip', 'Nothing booked yet.', 'Krabi', 'activity', false, '08:45', 130, '{}'::jsonb)
) as v(event_date, end_date, title, note, city, kind, done, start_time, sort_order, detail);

with t as (select id, start_date as d from trips where slug='demo-thailand-now')
insert into planned_events (trip_id, event_date, title, city, kind, done, start_time, sort_order, detail)
select t.id, v.* from t, lateral (values
  (t.d, 'BA9  LHR → BKK', 'Bangkok', 'flight', true, '21:35', 10,
   jsonb_build_object('airline','British Airways','flight_number','BA9','dep_airport','LHR','arr_airport','BKK',
     'dep_city','London','arr_city','Bangkok','dep_terminal','5','arr_terminal','1','dep_gate','A10',
     'baggage_belt','12','arr_time','16:15','arr_date',(t.d + 1)::text,'cabin','Economy','seat','32K',
     'booking_ref','J4KP2Q','status','landed')),
  (t.d + 6, 'FD3117  BKK → KBV', 'Krabi', 'flight', false, '10:20', 100,
   jsonb_build_object('airline','Thai AirAsia','flight_number','FD3117','dep_airport','BKK','arr_airport','KBV',
     'dep_city','Bangkok','arr_city','Krabi','dep_terminal','1','arr_time','11:45','cabin','Economy',
     'booking_ref','MW9T4L','status','scheduled')),
  (t.d + 8, 'FD3120  KBV → BKK', 'Bangkok', 'flight', false, '17:05', 140,
   jsonb_build_object('airline','Thai AirAsia','flight_number','FD3120','dep_airport','KBV','arr_airport','BKK',
     'dep_city','Krabi','arr_city','Bangkok','arr_terminal','1','arr_time','18:30','cabin','Economy',
     'booking_ref','MW9T4L','status','scheduled')),
  (t.d + 9, 'TG916  BKK → LHR', 'London', 'flight', false, '00:20', 150,
   jsonb_build_object('airline','Thai Airways','flight_number','TG916','dep_airport','BKK','arr_airport','LHR',
     'dep_city','Bangkok','arr_city','London','dep_terminal','1','arr_terminal','2','arr_time','07:00',
     'cabin','Economy','seat','41A','booking_ref','J4KP2Q','status','scheduled'))
) as v(event_date, title, city, kind, done, start_time, sort_order, detail);
