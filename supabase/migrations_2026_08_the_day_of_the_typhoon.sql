-- The day of the typhoon.
--
-- day_weather has kept a code and two temperatures since it was built, and
-- that is enough to put a symbol beside a journal entry. It is not enough to
-- write a sentence.
--
-- The WMO code scale collapses everything from a rumble of thunder to the
-- edge of a hurricane into 95–99, so the stored data could not tell David's
-- last day in Japan — "there was a typhoon on my last day" — from an
-- ordinary wet afternoon. Wind is the number that separates them, and rain
-- is the one that separates a shower from a day nobody went outside.
--
-- Both are already in the archive response and were simply not being asked
-- for. Existing rows keep their nulls; weather.js treats a row with no wind
-- reading as still to ask, so they fill in as trips are opened.
alter table public.day_weather
  add column if not exists wind_kmh numeric,
  add column if not exists rain_mm numeric;
