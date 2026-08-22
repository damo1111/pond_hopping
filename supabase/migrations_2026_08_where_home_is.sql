-- Where somebody lives, as a two-letter ISO code.
--
-- The one thing about a trip the app cannot work out for itself. Dates,
-- places and distances all fall out of the photographs; home does not, and
-- without it "you have been away five days" cannot be written.
--
-- Nullable on purpose: every existing profile predates the question, and a
-- default would be a guess written down as a fact.
alter table public.profiles
  add column if not exists home_country text
  check (home_country is null or home_country ~ '^[a-z]{2}$');

comment on column public.profiles.home_country is
  'ISO 3166-1 alpha-2, lowercase. Asked once on first run; changeable in Settings.';
