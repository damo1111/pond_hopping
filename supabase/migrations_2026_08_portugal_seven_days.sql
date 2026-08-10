-- Lisbon & Porto, tightened to seven days — and two holes closed.
-- Applied to production 9 Aug 2026; kept here as the record.
--
-- I had reported this trip as empty. It was not: twenty-two planned events,
-- and good ones. I had counted the `flights` table, which holds legs
-- already flown, and a trip that has not happened yet has none by
-- definition — its flights, hotels, trains and days out all live in
-- planned_events. The count was of the wrong table.
--
-- What was actually missing, once read properly:
--
--   1. Nowhere to sleep in Porto. Lisbon had Baixa House for four nights;
--      the Porto half of the trip had no hotel row at all.
--   2. 14 October, entirely empty — a day in the middle with nothing on it.
--
-- Seven days closes both without losing anything. The Douro moves into the
-- empty day, where it belongs anyway (a full day out needs a whole day, not
-- the tail of one), the last three days compress into a proper final
-- morning, and Porto gets somewhere to stay.

update trips
set end_date = '2026-10-15',
    subtitle = 'Seven days · Lisbon, Sintra, Porto and the Douro'
where slug = 'demo-portugal';

update planned_events set event_date = '2026-10-14'
where trip_id = 'f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3' and title like 'Douro valley%';

update planned_events set event_date = '2026-10-14', start_time = '19:30'
where trip_id = 'f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3' and title like 'Dinner at Cantina 32%';

update planned_events set event_date = '2026-10-15'
where trip_id = 'f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3'
  and event_date in ('2026-10-16', '2026-10-17');

insert into planned_events (trip_id, event_date, end_date, kind, city, title, note, start_time, sort_order)
select 'f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3', '2026-10-13', '2026-10-15', 'hotel', 'Porto',
       'Hotel — Torel Avantgarde, Porto', '2 nights · booked · room with the river view', '15:00', 0
where not exists (
  select 1 from planned_events
  where trip_id = 'f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3' and kind = 'hotel' and city = 'Porto'
);

-- Two evenings that ended at teatime. A planner with a gap where dinner
-- should be reads as unfinished rather than as a plan.
insert into planned_events (trip_id, event_date, kind, city, title, note, start_time, sort_order)
select * from (values
  ('f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3'::uuid, '2026-10-11'::date, 'activity', 'Lisbon',
   'Dinner at A Cevicheria, Príncipe Real', 'Walk-in only. There will be a wait, and it is worth it.', '19:45'::time, 1),
  ('f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3'::uuid, '2026-10-12'::date, 'activity', 'Lisbon',
   'Dinner at Cervejaria Ramiro', 'Garlic prawns, then a prego for pudding. That is the order.', '20:00'::time, 1)
) as v
where not exists (
  select 1 from planned_events
  where trip_id = 'f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3' and title like 'Dinner at Cerve%'
);

-- Checked rather than assumed: seven days, a bed in Porto, nothing outside
-- the trip, and no empty day left in the middle.
do $$
declare n int; days int; gap int;
begin
  select count(*) into n from planned_events
   where trip_id = 'f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3' and kind = 'hotel' and city = 'Porto';
  if n <> 1 then raise exception 'Porto still has nowhere to sleep'; end if;

  select (end_date - start_date) + 1 into days from trips where slug = 'demo-portugal';
  if days <> 7 then raise exception 'the trip is % days, not seven', days; end if;

  select count(*) into n from planned_events p join trips t on t.id = p.trip_id
   where t.slug = 'demo-portugal' and (p.event_date < t.start_date or p.event_date > t.end_date);
  if n > 0 then raise exception '% events fall outside the seven days', n; end if;

  select count(*) into gap from generate_series('2026-10-09'::date, '2026-10-15'::date, '1 day') d
   where not exists (
     select 1 from planned_events
     where trip_id = 'f6dc42a0-4e4f-4bd0-8dab-b36ff00072e3' and event_date = d
   );
  if gap > 0 then raise exception '% days have nothing on them', gap; end if;
end $$;
