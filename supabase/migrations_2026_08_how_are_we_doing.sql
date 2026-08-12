-- Product numbers, out of the events that were already being written.
--
-- app_events has been collecting for a while and nothing has ever read it.
-- Which means the app can tell you that it broke — what_is_broken() does
-- that — and cannot tell you whether anybody is using it, whether they get
-- anywhere, or whether the thing they came for worked.
--
-- David, 12 August: bounce as an A/B metric can wait, "but measuring bounce
-- and product KPIs is" essential. So this is the KPI layer and not the
-- experiment layer: no variants, no significance, no arms. Just the handful
-- of numbers that say whether the product is working.
--
-- ── The shape ─────────────────────────────────────────────────────────
--
-- Every metric comes back as four integers: a numerator and denominator for
-- the last N days, and the same pair for the N days before that. Nothing is
-- divided here and nothing is rounded, because a rate with no denominator is
-- unreadable — "activation is 40%" means something very different at 5
-- sessions and at 500 — and because the direction of travel is the only way
-- to read a number you have never seen before. The app does the arithmetic,
-- and refuses to state a rate at all until there is enough of it (see
-- src/lib/kpis.js).
--
-- A session belongs to the window its *first* event falls in, not the window
-- each event falls in. Otherwise a session that straddles midnight on the
-- boundary is counted in both halves and every comparison is slightly wrong.
--
-- ── Why a function and not a view ─────────────────────────────────────
--
-- app_events is readable by nobody. Anyone may write to it and no key may
-- read it back, which is what stops one hopper's usage being visible to
-- another. A view would inherit the caller's rights and return nothing; this
-- is SECURITY DEFINER and refuses anybody who is not an admin, in the same
-- shape as what_is_broken().

create or replace function public.how_are_we_doing(p_days int default 28)
returns table (
  metric text,
  n bigint,
  d bigint,
  n_before bigint,
  d_before bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  win interval;
begin
  -- Refused rather than filtered. A caller who is not an admin gets no rows
  -- at all, which is the same answer as "nothing happened" — so the app
  -- checks is_admin() separately before deciding whether to show anything.
  if not public.is_admin() then
    return;
  end if;

  -- Bounded so a stray parameter cannot ask for a table scan of all time.
  win := make_interval(days => greatest(1, least(365, coalesce(p_days, 28))));

  return query
  with bounds as (
    select now() - win as this_from, now() - (win * 2) as prev_from
  ),
  -- One row per session, with its facts collapsed into flags. Everything
  -- below is counted off this, so a session with four hundred events weighs
  -- exactly as much as a session with two — which is the point: these are
  -- numbers about people, not about activity.
  sess as (
    select
      e.session_id,
      min(e.created_at) as first_at,
      max(e.user_id::text) as who,
      count(*) filter (where e.event <> 'app_open') as did_anything,
      bool_or(e.event = 'app_open') as opened,
      bool_or(e.event = 'tile_shown') as saw_tile,
      bool_or(e.event = 'tile_tapped') as tapped_tile,
      bool_or(e.event = 'route_taken') as took_route,
      bool_or(e.event in ('trip_from_photos', 'trip_from_timeline', 'paste_trip_made')) as made_trip,
      bool_or(e.event = 'sign_in_code_asked') as asked_code,
      bool_or(e.event = 'sign_in_code_entered') as typed_code,
      bool_or(e.event = 'signed_in') as got_in
    from public.app_events e, bounds b
    where e.created_at >= b.prev_from
    group by e.session_id
  ),
  -- Which half of the comparison each session lands in.
  tagged as (
    select s.*, (s.first_at >= b.this_from) as is_now
    from sess s, bounds b
  ),
  -- A session that produced a fault. Joined by session rather than counted
  -- on its own, so "how many people hit something broken" is a share of the
  -- same denominator as everything else.
  broke as (
    select distinct a.session_id
    from public.app_errors a, bounds b
    where a.last_at >= b.prev_from
      and a.kind in ('crash', 'error', 'rejection')
  ),
  -- Somebody who came back on a different day. Only signed-in people can be
  -- followed across sessions — a signed-out hopper is a new session id every
  -- time storage is cleared — so this is deliberately a smaller population
  -- than the rest, and the denominator says so.
  days_seen as (
    select e.user_id::text as who,
           count(distinct (e.created_at at time zone 'UTC')::date) as days,
           min(e.created_at) as first_at
    from public.app_events e, bounds b
    where e.created_at >= b.prev_from and e.user_id is not null
    group by e.user_id
  ),
  returners as (
    select d.*, (d.first_at >= b.this_from) as is_now from days_seen d, bounds b
  )

  -- ── The numbers ────────────────────────────────────────────────────
  -- Order is the order they should be read in: how many, did they stay,
  -- did they get anywhere, could they get in, did it work.

  -- How many sessions opened the app at all.
  select 'opened'::text,
         count(*) filter (where t.is_now and t.opened),
         null::bigint,
         count(*) filter (where not t.is_now and t.opened),
         null::bigint
  from tagged t

  union all
  -- And how many distinct signed-in people that was. The gap between this
  -- and 'opened' is the anonymous half of the audience, which is most of it.
  select 'people',
         count(distinct t.who) filter (where t.is_now),
         null,
         count(distinct t.who) filter (where not t.is_now),
         null
  from tagged t

  union all
  -- Bounce: opened the app and did nothing else whatsoever. Not "left
  -- quickly" — there is no timing here — but "produced no second event",
  -- which is the honest version of the question and needs no heartbeat.
  select 'bounced',
         count(*) filter (where t.is_now and t.opened and t.did_anything = 0),
         count(*) filter (where t.is_now and t.opened),
         count(*) filter (where not t.is_now and t.opened and t.did_anything = 0),
         count(*) filter (where not t.is_now and t.opened)
  from tagged t

  union all
  -- The way in, tapped. Denominator is sessions that were actually shown it,
  -- not every session — somebody deep in a trip never sees the tile and
  -- should not count against it.
  select 'tapped_the_way_in',
         count(*) filter (where t.is_now and t.tapped_tile),
         count(*) filter (where t.is_now and t.saw_tile),
         count(*) filter (where not t.is_now and t.tapped_tile),
         count(*) filter (where not t.is_now and t.saw_tile)
  from tagged t

  union all
  -- Chose a route once the sheet was open.
  select 'chose_a_route',
         count(*) filter (where t.is_now and t.took_route),
         count(*) filter (where t.is_now and t.tapped_tile),
         count(*) filter (where not t.is_now and t.took_route),
         count(*) filter (where not t.is_now and t.tapped_tile)
  from tagged t

  union all
  -- And came out the other end with a trip. This is the one that matters:
  -- everything above it is a step towards it.
  select 'made_a_trip',
         count(*) filter (where t.is_now and t.made_trip),
         count(*) filter (where t.is_now and t.took_route),
         count(*) filter (where not t.is_now and t.made_trip),
         count(*) filter (where not t.is_now and t.took_route)
  from tagged t

  union all
  -- Asked for a code and then typed one in. A code that never arrives shows
  -- up here and nowhere else.
  select 'typed_the_code',
         count(*) filter (where t.is_now and t.typed_code),
         count(*) filter (where t.is_now and t.asked_code),
         count(*) filter (where not t.is_now and t.typed_code),
         count(*) filter (where not t.is_now and t.asked_code)
  from tagged t

  union all
  -- And the code worked.
  select 'got_in',
         count(*) filter (where t.is_now and t.got_in),
         count(*) filter (where t.is_now and t.typed_code),
         count(*) filter (where not t.is_now and t.got_in),
         count(*) filter (where not t.is_now and t.typed_code)
  from tagged t

  union all
  -- Came back on another day. Signed-in people only; see days_seen.
  select 'came_back',
         count(*) filter (where r.is_now and r.days > 1),
         count(*) filter (where r.is_now),
         count(*) filter (where not r.is_now and r.days > 1),
         count(*) filter (where not r.is_now)
  from returners r

  union all
  -- Hit something broken. The only metric here where up is bad and the app
  -- has to know that — see BADNESS in kpis.js.
  select 'hit_a_fault',
         count(*) filter (where t.is_now and t.session_id in (select session_id from broke)),
         count(*) filter (where t.is_now),
         count(*) filter (where not t.is_now and t.session_id in (select session_id from broke)),
         count(*) filter (where not t.is_now)
  from tagged t;
end;
$$;

revoke all on function public.how_are_we_doing(int) from public, anon;
grant execute on function public.how_are_we_doing(int) to authenticated;

comment on function public.how_are_we_doing(int) is
  'Product KPIs over app_events for the last N days against the N before. Admin only; returns no rows otherwise.';
