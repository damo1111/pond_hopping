-- The first tranche of the lounge dataset: the six airports on the live trip.
-- Hand-curated, because there is no API worth having — see docs/lounges.md.
--
-- Two honesty rules run through this file and matter more than the rows:
--
--   verified_at is set only where the access rules were actually checked
--   against the operator's own page. Everything else is left null so the app
--   can say "we haven't checked this" rather than quietly asserting it.
--
--   editorial_note is opinion and is written as opinion. rank is the whole
--   product — 1 means go here — and it is a judgement, not a rating average.
--
-- Safe to re-run: lounges are keyed on (airport, terminal, name), and the
-- child rows are deleted and rebuilt from this file.

insert into lounges (airport, terminal, name, operator, alliance, where_exactly, hours, rank, editorial_note, verified_at, source_url) values

-- LHR Terminal 3 — the oneworld cluster, and the case the feature exists for.
('LHR', '3', 'Cathay Pacific First Class Lounge', 'Cathay Pacific', 'oneworld',
 'Lounge C, up the escalator near Gate 11',
 '{"open":"05:30","close":"21:00","note":"or the last Cathay departure of the day"}',
 1, 'The quiet one. Dining Room is a la carte rather than a buffet, and it is the reason to walk past the others.',
 '2026-08-09', 'https://www.cathaypacific.com/cx/en_GB/destinations/lounges/london-lhr/cathay-pacific-lounge.html'),

('LHR', '3', 'Cathay Pacific Business Class Lounge', 'Cathay Pacific', 'oneworld',
 'Lounge C, up the escalator near Gate 11',
 '{"open":"05:30","close":"21:00","note":"or the last Cathay departure of the day"}',
 3, 'Next door to the First lounge and busier. The Noodle Bar is the draw.',
 '2026-08-09', 'https://www.cathaypacific.com/cx/en_GB/destinations/lounges/london-lhr/cathay-pacific-lounge.html'),

('LHR', '3', 'Qantas London Lounge', 'Qantas', 'oneworld',
 'Same concourse as the Cathay lounges',
 '{"open":"08:00","close":"21:05"}',
 2, 'Two levels, a menu by Neil Perry, and a cocktail bar upstairs over the airfield. The one to pick if you want to eat properly.',
 '2026-08-09', 'https://www.qantas.com/us/en/qantas-experience/at-the-airport/airport-lounges/all-qantas-airport-lounges/the-qantas-london-lounge.html'),

('LHR', '3', 'American Airlines Lounge', 'American Airlines', 'oneworld',
 null, null,
 4, 'Third choice of the three oneworld lounges here. The exact name and the access rules both need checking against American''s own page.',
 null, null),

('LHR', '3', 'American Express Centurion Lounge', 'American Express', null,
 null, null,
 5, 'A cardholder lounge rather than an alliance one, and the first Centurion lounge outside the US. Guest policy needs checking.',
 null, null),

('LHR', '3', 'No1 Lounge', 'No1 Lounges', null,
 null, null,
 7, 'The Priority Pass option, and reported as chronically overcrowded. Somewhere to sit, not somewhere to plan around.',
 null, null),

-- HEL — Finnair's home, and the reason the Emerald/Sapphire split matters.
('HEL', 'Non-Schengen', 'Finnair Platinum Wing', 'Finnair', 'oneworld',
 'Non-Schengen side',
 '{"open":"10:30","close":"00:00"}',
 1, 'oneworld Emerald only — Sapphire goes next door, which is the distinction most lounge lists get wrong. Sauna and private shower suites.',
 '2026-08-09', 'https://www.finnair.com/gb-en/smooth-travelling-at-helsinki-airport/finnair-lounges-at-helsinki-airport'),

('HEL', 'Non-Schengen', 'Finnair Lounge', 'Finnair', 'oneworld',
 'Non-Schengen side, next to the Platinum Wing', null,
 2, 'The Sapphire and business class room. Perfectly good; just not the Wing.',
 '2026-08-09', 'https://www.finnair.com/gb-en/smooth-travelling-at-helsinki-airport/finnair-lounges-at-helsinki-airport'),

('HEL', 'Schengen', 'Finnair Lounge', 'Finnair', 'oneworld',
 'Schengen side', null,
 3, 'Rebuilt recently, with a Platinum Corner set aside for Emeralds. Needs checking on the ground.',
 null, null),

-- CMB
('CMB', 'Main', 'Serendib Lounge', 'SriLankan Airlines', 'oneworld',
 'Airside, first floor, next to Flemingo Duty Free', null,
 1, 'The oneworld business lounge at Colombo, and the one to head for.',
 null, 'https://www.srilankan.com/en_uk/flying-with-us/serendib-lounge'),

('CMB', 'Main', 'Araliya Lounge', null, null,
 'Airside, first floor, near Gate 6',
 '{"open":"00:00","close":"24:00","note":"open around the clock"}',
 2, 'A shared contract lounge — oneworld, SkyTeam and Star Alliance all use it, and it feels like it.',
 null, null),

-- MEL
('MEL', '2', 'Qantas International First Lounge', 'Qantas', 'oneworld',
 'International terminal, after security', null,
 1, 'Emerald only, and worth the walk.',
 null, null),

('MEL', '2', 'Qantas International Business Lounge', 'Qantas', 'oneworld',
 'International terminal, after security', null,
 2, 'Large, reliable, and busy at the evening bank.',
 null, null),

-- SYD
('SYD', '1', 'Qantas International First Lounge', 'Qantas', 'oneworld',
 'Terminal 1, after security', null,
 1, 'Emerald, on a same-day oneworld-marketed and oneworld-operated flight — Qantas enforce that pairing here more than most.',
 '2026-08-09', null),

('SYD', '1', 'Qantas International Business Lounge', 'Qantas', 'oneworld',
 'Terminal 1, after security', null,
 2, 'The default if the First lounge turns you away.',
 null, null),

-- OPO — where the honest answer is that there is no oneworld lounge at all.
('OPO', '1', 'ANA Lounge', 'ANA Aeroportos de Portugal', null,
 'Airside, level 3, next to gates 31 and 32',
 '{"open":"04:00","close":"21:00"}',
 1, 'Porto has no oneworld lounge. This is the Priority Pass one, three hours maximum, and it is fine.',
 '2026-08-09', 'https://www.portoairport.pt/en/opo/services-shopping/premium-services/ana-lounge'),

('OPO', '1', 'TAP Premium Lounge', 'TAP Air Portugal', 'staralliance',
 'Airside', null,
 2, 'TAP and Star Alliance only. Not a Priority Pass lounge, whatever the aggregators say.',
 '2026-08-09', null)

on conflict (airport, coalesce(terminal, ''), name) do update set
  operator       = excluded.operator,
  alliance       = excluded.alliance,
  where_exactly  = excluded.where_exactly,
  hours          = excluded.hours,
  rank           = excluded.rank,
  editorial_note = excluded.editorial_note,
  verified_at    = excluded.verified_at,
  source_url     = excluded.source_url;


-- Access rules. Every door a lounge has is its own row, so that an answer can
-- say which one you came through.
delete from lounge_access where lounge_id in (
  select id from lounges where airport in ('LHR', 'HEL', 'CMB', 'MEL', 'SYD', 'OPO')
);

insert into lounge_access (lounge_id, via, alliance, tier, cabin, programme, airline, same_alliance_flight, guests, price, note)
select l.id, a.via, a.alliance, a.tier, a.cabin, a.programme, a.airline, a.same_alliance_flight, a.guests, a.price, a.note
from (values
  -- airport, terminal, lounge, via, alliance, tier, cabin, programme, airline, same_alliance_flight, guests, price, note
  ('LHR'::text, '3'::text, 'Cathay Pacific First Class Lounge'::text, 'alliance_tier'::text, 'oneworld'::text, 'emerald'::text, null::text, null::text, null::text, true, 1, null::text, null::text),
  ('LHR', '3', 'Cathay Pacific First Class Lounge', 'cabin', null, null, 'first', null, 'CX', false, 1, null, null),

  ('LHR', '3', 'Cathay Pacific Business Class Lounge', 'alliance_tier', 'oneworld', 'sapphire', null, null, null, true, 1, null, null),
  ('LHR', '3', 'Cathay Pacific Business Class Lounge', 'cabin', null, null, 'business', null, 'CX', false, 1, null, null),

  ('LHR', '3', 'Qantas London Lounge', 'alliance_tier', 'oneworld', 'sapphire', null, null, null, true, 1, null, 'Emerald and Sapphire, one guest each'),
  ('LHR', '3', 'Qantas London Lounge', 'cabin', null, null, 'business', null, 'QF', false, 0, null, null),
  ('LHR', '3', 'Qantas London Lounge', 'programme', null, null, null, 'Qantas Club', null, false, 1, null, null),
  ('LHR', '3', 'Qantas London Lounge', 'paid', null, null, null, null, null, false, 0, '£110', 'Walk-in day rate'),

  ('LHR', '3', 'American Airlines Lounge', 'alliance_tier', 'oneworld', 'sapphire', null, null, null, true, 1, null, null),
  ('LHR', '3', 'American Airlines Lounge', 'cabin', null, null, 'business', null, null, false, 0, null, null),

  ('LHR', '3', 'American Express Centurion Lounge', 'card', null, null, null, 'American Express Platinum', null, false, 0, null, null),
  ('LHR', '3', 'American Express Centurion Lounge', 'card', null, null, null, 'American Express Centurion', null, false, 0, null, null),

  ('LHR', '3', 'No1 Lounge', 'priority_pass', null, null, null, null, null, false, 0, null, null),
  ('LHR', '3', 'No1 Lounge', 'paid', null, null, null, null, null, false, 0, null, null),

  ('HEL', 'Non-Schengen', 'Finnair Platinum Wing', 'alliance_tier', 'oneworld', 'emerald', null, null, null, true, 1, null, 'Guest must be flying from the same side of the Schengen border'),

  ('HEL', 'Non-Schengen', 'Finnair Lounge', 'alliance_tier', 'oneworld', 'sapphire', null, null, null, true, 1, null, null),
  ('HEL', 'Non-Schengen', 'Finnair Lounge', 'cabin', null, null, 'business', null, null, false, 0, null, null),

  ('HEL', 'Schengen', 'Finnair Lounge', 'alliance_tier', 'oneworld', 'sapphire', null, null, null, true, 1, null, null),
  ('HEL', 'Schengen', 'Finnair Lounge', 'cabin', null, null, 'business', null, null, false, 0, null, null),

  ('CMB', 'Main', 'Serendib Lounge', 'alliance_tier', 'oneworld', 'sapphire', null, null, null, true, 1, null, null),
  ('CMB', 'Main', 'Serendib Lounge', 'cabin', null, null, 'business', null, null, false, 0, null, null),

  -- No alliance named: a shared contract lounge takes any alliance's status.
  ('CMB', 'Main', 'Araliya Lounge', 'alliance_tier', null, 'sapphire', null, null, null, false, 1, null, null),
  ('CMB', 'Main', 'Araliya Lounge', 'cabin', null, null, 'business', null, null, false, 0, null, null),

  ('MEL', '2', 'Qantas International First Lounge', 'alliance_tier', 'oneworld', 'emerald', null, null, null, true, 1, null, null),
  ('MEL', '2', 'Qantas International First Lounge', 'cabin', null, null, 'first', null, null, false, 1, null, null),
  ('MEL', '2', 'Qantas International Business Lounge', 'alliance_tier', 'oneworld', 'sapphire', null, null, null, true, 1, null, null),
  ('MEL', '2', 'Qantas International Business Lounge', 'cabin', null, null, 'business', null, null, false, 0, null, null),
  ('MEL', '2', 'Qantas International Business Lounge', 'programme', null, null, null, 'Qantas Club', null, false, 1, null, null),

  ('SYD', '1', 'Qantas International First Lounge', 'alliance_tier', 'oneworld', 'emerald', null, null, null, true, 1, null, 'Same-day oneworld-marketed and oneworld-operated flight'),
  ('SYD', '1', 'Qantas International First Lounge', 'cabin', null, null, 'first', null, null, false, 1, null, null),
  ('SYD', '1', 'Qantas International Business Lounge', 'alliance_tier', 'oneworld', 'sapphire', null, null, null, true, 1, null, null),
  ('SYD', '1', 'Qantas International Business Lounge', 'cabin', null, null, 'business', null, null, false, 0, null, null),
  ('SYD', '1', 'Qantas International Business Lounge', 'programme', null, null, null, 'Qantas Club', null, false, 1, null, null),

  ('OPO', '1', 'ANA Lounge', 'priority_pass', null, null, null, null, null, false, 0, null, 'Three hours maximum'),
  ('OPO', '1', 'ANA Lounge', 'paid', null, null, null, null, null, false, 0, '€37–43', null),

  ('OPO', '1', 'TAP Premium Lounge', 'alliance_tier', 'staralliance', 'gold', null, null, null, true, 1, null, null),
  ('OPO', '1', 'TAP Premium Lounge', 'cabin', null, null, 'business', null, 'TP', false, 0, null, null),
  ('OPO', '1', 'TAP Premium Lounge', 'cabin', null, null, 'premium_economy', null, 'TP', false, 0, null, null)
) as a (airport, terminal, name, via, alliance, tier, cabin, programme, airline, same_alliance_flight, guests, price, note)
join lounges l
  on l.airport = a.airport
 and coalesce(l.terminal, '') = coalesce(a.terminal, '')
 and l.name = a.name;


-- Tips. The layer nobody else has, and the one that has to say who said it.
delete from lounge_tips where lounge_id in (
  select id from lounges where airport in ('LHR', 'HEL', 'CMB', 'MEL', 'SYD', 'OPO')
) and author is null;

insert into lounge_tips (lounge_id, category, tip, author, source_type, source_url)
select l.id, t.category, t.tip, null, t.source_type, t.source_url
from (values
  ('LHR'::text, '3'::text, 'Cathay Pacific First Class Lounge'::text, 'food'::text,
   'The Dining Room is a la carte, Western and Asian. Order from the menu rather than queuing.'::text,
   'official'::text, 'https://www.cathaypacific.com/cx/en_GB/destinations/lounges/london-lhr/cathay-pacific-lounge.html'::text),
  ('LHR', '3', 'Cathay Pacific Business Class Lounge', 'food',
   'The Noodle Bar makes them to order, and is the reason people come to this one instead.',
   'official', 'https://www.cathaypacific.com/cx/en_GB/destinations/lounges/london-lhr/cathay-pacific-lounge.html'),
  ('LHR', '3', 'Qantas London Lounge', 'food',
   'Menu by Neil Perry, and a la carte in the evening. The upstairs bar looks over the airfield.',
   'published', null),
  ('LHR', '3', 'No1 Lounge', 'timing',
   'Reported as chronically overcrowded at peak — worth having a second plan.',
   'published', null),
  ('HEL', 'Non-Schengen', 'Finnair Platinum Wing', 'shower',
   'There is a Finnish sauna and private shower suites. Ask at the desk on arrival, not when you are ready.',
   'official', 'https://www.finnair.com/gb-en/smooth-travelling-at-helsinki-airport/finnair-lounges-at-helsinki-airport'),
  ('OPO', '1', 'ANA Lounge', 'timing',
   'Priority Pass entry is capped at three hours.',
   'official', 'https://www.portoairport.pt/en/opo/services-shopping/premium-services/ana-lounge')
) as t (airport, terminal, name, category, tip, source_type, source_url)
join lounges l
  on l.airport = t.airport
 and coalesce(l.terminal, '') = coalesce(t.terminal, '')
 and l.name = t.name;
