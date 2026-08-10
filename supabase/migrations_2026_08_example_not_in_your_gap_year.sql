-- The Rome example was filed under "2024 Gap Year".
-- Applied to production 10 Aug 2026; kept here as the record.
--
-- It was copied from the real Rome and inherited its chapter along with
-- everything else, which I did not think about. The effect on a stranger's
-- globe is a folder named after somebody else's year containing exactly one
-- trip — a private organising label, shown to people who have no idea what
-- it refers to, wrapped around the one trip meant to sell them the app.
--
-- Both halves of the fix are the same line: take the example out of the
-- folder, and the folder leaves the demo with it, because no other example
-- was ever in it. The real trips keep their chapter untouched.
update trips set chapter = null where slug = 'rome-example';

do $$
declare n int;
begin
  select count(*) into n from trips where is_demo and chapter is not null;
  if n > 0 then raise exception '% example trips are still filed in a chapter', n; end if;

  select count(*) into n from trips where chapter = '2024 Gap Year' and not is_demo;
  if n <> 8 then raise exception 'the real 2024 Gap Year has % trips, expected 8', n; end if;
end $$;
