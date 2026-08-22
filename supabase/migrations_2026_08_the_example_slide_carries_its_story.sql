-- The example trip slides forward every hour so it is always mid-trip when
-- somebody opens the app. It already carried the trip's dates, its planned
-- events and its photographs.
--
-- It did not carry the writing. So the day entries and the story's chapters
-- stayed where they were seeded while everything around them moved, and
-- within a day the demo was telling you about Tuesday underneath Wednesday's
-- photographs — the exact failure the arr_date comment inside already warns
-- about, in a place nobody had thought to look because until then this trip
-- had no writing on it at all.

create or replace function public.keep_the_example_underway(day_of integer default 5)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  example public.trips%rowtype;
  slide integer;
begin
  select * into example
    from public.trips
   where slug = 'demo-thailand-now' and is_demo and start_date is not null;

  if not found then
    return 0;
  end if;

  -- Where day one should be for today to be day_of + 1.
  slide := (current_date - day_of) - example.start_date;

  -- Twenty-three runs in twenty-four end here. The job is a correction.
  if slide = 0 then
    return 0;
  end if;

  update public.trips
     set start_date = start_date + slide,
         end_date   = end_date + slide
   where id = example.id
     and is_demo;

  update public.planned_events
     set event_date = event_date + slide,
         end_date   = end_date + slide,
         -- arr_date rides inside the detail rather than in a column, so it
         -- has to be moved by hand or a red-eye's arrival stays on the day
         -- it was seeded and the card starts claiming the flight lands
         -- before it left.
         detail = case
           when detail ? 'arr_date' and coalesce(detail->>'arr_date','') <> ''
             then jsonb_set(detail, '{arr_date}',
                            to_jsonb(((detail->>'arr_date')::date + slide)::text))
           else detail
         end
   where trip_id = example.id;

  update public.photos
     set taken_on = taken_on + slide,
         taken_at = taken_at + make_interval(days => slide)
   where trip_id = example.id;

  -- The day-by-day writing. day_number is relative to start_date and both
  -- move by the same amount, so it stays true without being touched.
  update public.journal_entries
     set entry_date = entry_date + slide
   where trip_id = example.id;

  -- And the trip story, whose chapter dates live inside a jsonb array for
  -- the same reason arr_date does — out of reach of an ordinary update.
  update public.trip_stories s
     set chapters = coalesce((
           select jsonb_agg(
                    case
                      when c ? 'date' and coalesce(c->>'date', '') <> ''
                        then jsonb_set(c, '{date}',
                                       to_jsonb(((c->>'date')::date + slide)::text))
                      else c
                    end
                    order by ord)
             from jsonb_array_elements(s.chapters) with ordinality as x(c, ord)
         ), '[]'::jsonb)
   where s.trip_id = example.id
     and jsonb_typeof(s.chapters) = 'array';

  return slide;
end
$function$;
