-- Singapore + Malaysia trip (22-28 Apr 2026), resolved from ByAir bookings
-- cross-checked against the on-device Timeline GPS. Note: the 15 Apr ByAir
-- records were the ORIGINAL booking, moved a week (GPS shows a Mornington
-- Peninsula weekend on the 15th-16th). BA16 out, BA15 home, MH hops to KL.
update public.trips set start_date='2026-04-22', end_date='2026-04-28',
  subtitle='MEL → SYD → Singapore → KL · BA16 out, BA15 home'
where slug='singapore-malaysia';

delete from public.flights where trip_id=(select id from trips where slug='singapore-malaysia');
insert into public.flights (trip_id, flight_number, airline, dep_airport, dep_city, dep_lat, dep_lon, arr_airport, arr_city, arr_lat, arr_lon, dep_time, arr_time, distance_km, sort_order)
select id, v.n, v.al, v.da, v.dc, v.dla, v.dlo, v.aa, v.ac, v.ala, v.alo, v.dt::timestamptz, v.at::timestamptz, v.km, v.o from public.trips, (values
  ('QF410','Qantas','MEL','Melbourne',-37.673309,144.843115,'SYD','Sydney',-33.94611,151.17722,'2026-04-22T07:00:00+10:00','2026-04-22T08:25:00+10:00',705,0),
  ('BA16','British Airways','SYD','Sydney',-33.94611,151.17722,'SIN','Singapore',1.355501,103.991421,'2026-04-22T14:35:00+10:00','2026-04-22T21:00:00+08:00',6294,1),
  ('MH624','Malaysia Airlines','SIN','Singapore',1.355501,103.991421,'KUL','Kuala Lumpur',2.745578,101.709917,'2026-04-25T15:35:00+08:00','2026-04-25T16:40:00+08:00',316,2),
  ('MH619','Malaysia Airlines','KUL','Kuala Lumpur',2.745578,101.709917,'SIN','Singapore',1.355501,103.991421,'2026-04-27T14:20:00+08:00','2026-04-27T15:25:00+08:00',316,3),
  ('BA15','British Airways','SIN','Singapore',1.355501,103.991421,'SYD','Sydney',-33.94611,151.17722,'2026-04-27T20:20:00+08:00','2026-04-28T06:20:00+10:00',6294,4),
  ('JQ507','Jetstar','SYD','Sydney',-33.94611,151.17722,'MEL','Melbourne',-37.673309,144.843115,'2026-04-28T08:15:00+10:00','2026-04-28T09:50:00+10:00',705,5)
) as v(n,al,da,dc,dla,dlo,aa,ac,ala,alo,dt,at,km,o)
where slug='singapore-malaysia';
-- (journal inserts applied live; see repo history / journal_entries table)
