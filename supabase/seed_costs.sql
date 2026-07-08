-- China+Japan costs from the Notion cost tracker (documented items only;
-- Swissôtel Shanghai omitted — amount not recorded). AUD conversions at
-- static rates (CNY 4.7 / JPY 95 / GBP 0.52 per AUD).
delete from public.costs where trip_id=(select id from trips where slug='china-japan');
insert into public.costs (trip_id, description, amount, currency, amount_aud, category, city, spent_on)
select id, v.d, v.amt, v.cur, v.aud, v.cat, v.city, v.dt::date from public.trips, (values
  ('QF0626 MEL→BNE — Avios cash component', 63.90, 'GBP', 122.88, 'Flight', 'Melbourne', '2026-05-21'),
  ('CX156/CX982 BNE→HKG→CAN — award taxes/fees', 243.80, 'GBP', 468.85, 'Flight', 'Brisbane', '2026-05-22'),
  ('Train G4 Shanghai → Beijing (Trip.com)', 490.40, 'AUD', 490.40, 'Transport', 'Shanghai', '2026-05-28'),
  ('Missed-train taxi toward Shanghai Station', 200, 'CNY', 42.55, 'Transport', 'Shanghai', '2026-05-28'),
  ('Sofitel Guangzhou Sunrich · 2 nights', 478, 'AUD', 478.00, 'Hotel', 'Guangzhou', '2026-05-22'),
  ('Fairmont Beijing · Fairmont Gold · 2 nights', 2775.08, 'CNY', 590.44, 'Hotel', 'Beijing', '2026-05-28'),
  ('Hilton Beijing Capital Airport · staff rate', 448.62, 'CNY', 95.45, 'Hotel', 'Beijing', '2026-05-30'),
  ('ANA InterContinental Tokyo · high floor king', 44450, 'JPY', 467.89, 'Hotel', 'Tokyo', '2026-05-31'),
  ('Hilton Tokyo · king room-only', 350, 'AUD', 350.00, 'Hotel', 'Tokyo', '2026-06-01'),
  ('Mercure Tokyo Hibiya · Privilege + lounge', 38850, 'JPY', 408.95, 'Hotel', 'Tokyo', '2026-06-02'),
  ('Villa Fontaine Grand Haneda', 101, 'AUD', 101.00, 'Hotel', 'Tokyo', '2026-06-03'),
  ('Sofitel Sydney Wentworth · prepaid night', 258.50, 'AUD', 258.50, 'Hotel', 'Sydney', '2026-06-04'),
  ('Sofitel Sydney Wentworth · 2 nights staff rate', 850, 'AUD', 850.00, 'Hotel', 'Sydney', '2026-06-05'),
  ('QF flight cancel fee (Tokyo extension)', 67, 'AUD', 67.00, 'Other', 'Tokyo', '2026-06-01'),
  ('VA SYD–MEL cancel fee (extension)', 60, 'AUD', 60.00, 'Other', 'Sydney', '2026-06-01')
) as v(d, amt, cur, aud, cat, city, dt)
where slug='china-japan';
