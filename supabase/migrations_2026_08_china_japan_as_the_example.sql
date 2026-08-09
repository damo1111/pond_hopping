-- China & Japan, as the example everyone sees.
--
-- A duplicate, not a promotion. The real trip is the reason this app
-- exists and is not touched by anything below — same rows, same words,
-- still private. This is a second trip that happens to have taken the same
-- flights.
--
-- What is different is what a public page has no business carrying. The
-- brand is written CΛNΛRD, with a Greek capital lambda, which is why a
-- search for "canard" came back clean and wasn't: it is in the subtitle, in
-- three entries, in the summary, and tagged on five days. Alongside it, the
-- trade — wholesale mornings, sample-hunting, sourcing errands, the
-- embroidery shop and the printer who finished the samples — and one named
-- person, in the airport gym on day one.
--
-- All of that goes. The travel stays exactly as written: every run and its
-- pace, the confiscated power bank, the orange departure boards, the missed
-- Beijing train, the Great Wall toboggan, the flight attendant who spotted
-- the luggage tags, the typhoon, Hamarikyu at dawn. Fashion-as-a-lens stays
-- too — it is the best thread in the journal and it says nothing about a
-- business. What is cut is what was being *bought*, not what was noticed.
--
-- No photographs are copied. The two trips are curated separately and will
-- hold genuinely different files, which also retires the ?example suffix
-- that only ever existed to dodge photos_url_key.


-- A fixed id so this can be re-run without minting a second copy.
insert into trips (id, slug, title, subtitle, start_date, end_date, countries, sort_order, status, is_public, is_demo, owner_id)
select
  '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2',
  'china-japan-example',
  t.title,
  -- Was "CΛNΛRD sourcing leg · MEL → HK → GZ → SH → BJ → Tokyo → SYD", and
  -- the subtitle is the first thing on the card.
  'Sixteen days, seven cities · MEL → HK → GZ → SH → BJ → Tokyo → SYD',
  t.start_date, t.end_date, t.countries,
  999,               -- examples sit at the end, like the other one
  'confirmed',       -- the recorder ignores drafts, and so does trip_meta
  true, true,
  t.owner_id
from trips t
where t.slug = 'china-japan'
on conflict (id) do nothing;

-- Flights, runs and costs come across as they are: they are facts about
-- aeroplanes and pavement, and none of them says who was buying what.
-- owner_email, travellers and traveler are dropped — a public trip should
-- not carry an address, and Strava ids belong to one account.
insert into flights (trip_id, flight_number, airline, dep_airport, dep_city, dep_lat, dep_lon,
                     arr_airport, arr_city, arr_lat, arr_lon, dep_time, arr_time,
                     aircraft_type_id, registration, cabin, seat, config, distance_km, notes,
                     sort_order, status, purpose)
select '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2', flight_number, airline, dep_airport, dep_city, dep_lat, dep_lon,
       arr_airport, arr_city, arr_lat, arr_lon, dep_time, arr_time,
       aircraft_type_id, registration, cabin, seat, config, distance_km, notes,
       sort_order, status, purpose
from flights where trip_id = (select id from trips where slug = 'china-japan')
  and not exists (select 1 from flights where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2');

insert into runs (trip_id, run_date, label, city, distance_km, pace, hr_avg, hr_max, elevation_m, color, coords)
select '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2', run_date, label, city, distance_km, pace, hr_avg, hr_max, elevation_m, color, coords
from runs where trip_id = (select id from trips where slug = 'china-japan')
  and not exists (select 1 from runs where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2');

insert into costs (trip_id, description, amount, currency, amount_aud, category, city, spent_on)
select '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2', description, amount, currency, amount_aud, category, city, spent_on
from costs where trip_id = (select id from trips where slug = 'china-japan')
  and not exists (select 1 from costs where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2');

-- The journal is copied and then edited, rather than rewritten from
-- nothing, because the writing is the reason this trip is worth showing
-- anybody. Thirteen of the sixteen days come across untouched.
insert into journal_entries (trip_id, entry_date, day_number, city, title, note, mood, tags, lat, lon)
select '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2', entry_date, day_number, city, title, note, mood,
       -- The tag itself named the brand on five days.
       array_remove(tags, 'canard'),
       lat, lon
from journal_entries where trip_id = (select id from trips where slug = 'china-japan')
  and not exists (select 1 from journal_entries where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2');

-- Day 1 — a named person in the airport gym.
update journal_entries set note = replace(
  note,
  ' — spotted the airport gym on the way ("I saw Noah in there, getting some rowing practice in")',
  ' — spotted the airport gym on the way, which felt like a reproach'
) where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2' and entry_date = '2026-05-21';

-- Day 3 — the wholesale morning, and a night's work on the logo.
update journal_entries set note = replace(replace(
  note,
  'Then a wholesale-market morning — sample-hunting, sourcing errands.',
  'Then a morning working out how the markets fit together — who sells to whom, and in what quantity.'
),
  'Late that night, early design work: "Hours spent on that one. How the duck sits in a heart 🦆❤️".',
  'Late that night, drawing: "Hours spent on that one," and it was one small thing.'
) where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2' and entry_date = '2026-05-23';

-- Day 5 — the observation stays; the product it was about does not.
update journal_entries set note = replace(
  note,
  '"A duck with a beret isn''t the next big thing out there" — the self-awareness that would sharpen into a better question.',
  'The honest version of the thought: what works at home may simply not travel — which sharpened into a better question.'
) where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2' and entry_date = '2026-05-25';

-- Day 6.
update journal_entries set note = replace(
  note,
  'the kind of reflection that shapes where CΛNΛRD goes next',
  'the kind of reflection that shapes what comes next'
) where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2' and entry_date = '2026-05-26';

-- Day 13 — the heaviest one, and the only day rewritten rather than edited.
-- The typhoon pulling a day forward is the story; what it pulled forward is
-- the trade. The run, the hotel and the last line are untouched.
update journal_entries set
  title = 'Tokyo — the day the typhoon moved',
  note = 'The day that made the trip. Morning 11.42 km through Shinjuku into Yoyogi. Then a typhoon warning that pulled everything forward a day — "expecting the typhoon tomorrow," so tomorrow happened this afternoon instead, at a run. Mercure Tokyo Hibiya, right by Ginza. That night, to my husband: "This is the best solo trip I have ever done."

Stop by stop — 06:53 Hilton Tokyo, Shinjuku (1h39) → 09:23 Yoyogi, Tokyo (41m) → 12:00 Shinjuku (58m) → 13:45 Hilton Tokyo, Shinjuku (21m) → 14:16 Shinjuku (1h06) → 16:41 Mercure Tokyo Hibiya (1h).',
  tags = array['run', 'typhoon', 'highlight']
where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2' and entry_date = '2026-06-02';

-- Day 14.
update journal_entries set note = replace(
  note,
  'A big creative decision got made in the afternoon rain — one that shaped CΛNΛRD''s direction from here.',
  'A big decision got made in the afternoon rain — one that shaped everything after it.'
) where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2' and entry_date = '2026-06-03';

-- The summary named it twice, in the sentence that opens the trip and in
-- the one that closes the middle of it.
insert into trip_summaries (trip_id, summary)
select '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2',
  replace(replace(
    summary,
    'where sourcing, samples, WeChat Pay, Alipay and almost no English set the tone',
    'where the scale of the place, WeChat Pay, Alipay and almost no English set the tone'
  ),
    'the Tokyo typhoon brought the embroidery shop forward and turned into the day the CΛNΛRD samples were actually made',
    'the Tokyo typhoon pulled a whole day forward and turned into the best one of the sixteen'
  )
from trip_summaries where trip_id = (select id from trips where slug = 'china-japan')
on conflict (trip_id) do nothing;


-- Belt and braces: nothing on the copy may still say it, however it was
-- spelled. Fails loudly rather than publishing quietly.
do $$
declare n int;
begin
  select count(*) into n from journal_entries
   where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2'
     and (note ilike '%canard%' or note like '%CΛNΛRD%' or title like '%CΛNΛRD%'
          or note like '%Noah%' or 'canard' = any(tags));
  if n > 0 then
    raise exception 'the example journal still names the brand or a person, in % entries', n;
  end if;

  select count(*) into n from trips
   where slug = 'china-japan-example' and (subtitle like '%CΛNΛRD%' or subtitle ilike '%canard%');
  if n > 0 then raise exception 'the example subtitle still names the brand'; end if;

  select count(*) into n from trip_summaries
   where trip_id = '9d3a7c10-5b64-4f8e-9a21-6c0f1d84e7b2'
     and (summary like '%CΛNΛRD%' or summary ilike '%canard%');
  if n > 0 then raise exception 'the example summary still names the brand'; end if;

  -- And the real trip is exactly as it was.
  select count(*) into n from trips where slug = 'china-japan' and (is_demo or is_public);
  if n > 0 then raise exception 'the real trip has been made public — undo this'; end if;
end $$;

-- ── And then the guard declined the flag ──────────────────────────────────
--
-- guard_new_is_demo resets is_demo to false for anybody who is not an
-- admin. A migration has no JWT, so is_admin() is false, and the copy
-- landed public but unbadged — the worst of both, visible to everyone and
-- not marked as an example. The guard is there to stop app users promoting
-- their own trips, not the database owner, so it comes off for exactly
-- these two statements and goes straight back on.

alter table trips disable trigger guard_new_is_demo;
alter table trips disable trigger guard_is_demo;

-- China & Japan becomes the finished-trip example. Lisbon & Porto stays as
-- the planned one.
update trips set is_demo = true, is_public = true where slug = 'china-japan-example';

-- Hong Kong & South Korea steps back rather than being deleted: not an
-- example, and unpublished with it, because a public trip that is *not*
-- badged as an example reads to every visitor as somebody's real log. Every
-- row stays where it is, and the admin card in Account brings it back in
-- one tap.
update trips set is_demo = false, is_public = false where slug = 'hk-south-korea-example';

alter table trips enable trigger guard_new_is_demo;
alter table trips enable trigger guard_is_demo;

do $$
declare n int;
begin
  select count(*) into n from trips where slug = 'china-japan-example' and is_demo and is_public;
  if n <> 1 then raise exception 'the example did not take'; end if;
  select count(*) into n from trips where slug in ('china-japan', 'south-korea') and (is_demo or is_public);
  if n > 0 then raise exception 'a real trip has been published — undo this'; end if;
end $$;
