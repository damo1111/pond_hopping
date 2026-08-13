-- What somebody did before they had an account.
--
-- The question that started this: "I want to see what Vivien has done."
-- Vivien signed up on 11 August, waited five and a half minutes for a code,
-- got in — and the answer was nothing at all, because every event she
-- generated before that moment carried no user id and every event after it
-- was never sent. The half that can be fixed here is the first half.
--
-- ── The key already exists ────────────────────────────────────────────
--
-- `app_events.session_id` is misnamed. It is not a session: analytics.js
-- keeps it in **localStorage**, so it survives reloads, tab closes and
-- days. It is a device id and has been one all along — 240 of them, 37 seen
-- across more than one day, one seen across eleven. The column is not being
-- renamed, because these are grouped by string and renaming splits every
-- history in two for the sake of a better word.
--
-- So nothing needs to be collected that is not already collected. What was
-- missing is the moment of joining up: at sign-in, nobody ever went back
-- and said "those were this person's too". 403 anonymous events are sitting
-- on devices that later signed in, unattached to the account they belong to.
--
-- ── Why it is a function and not an update ────────────────────────────
--
-- `app_events` has exactly one policy — insert, to anybody. No select, no
-- update. That is the right shape for a log and it means the client cannot
-- do this itself, which is also right: an update the browser could write is
-- an update anybody can write.

/**
 * Claim this device's past as mine.
 *
 * Called once at sign-in with the device id the browser is already using.
 *
 * Three things make it safe to expose:
 *
 *   - It claims **only unclaimed rows**. An event that already belongs to
 *     somebody cannot be taken from them, so this cannot be used to read or
 *     rewrite another account's history.
 *   - It claims **to auth.uid()**, never to a parameter. There is no way to
 *     express "give these to somebody else".
 *   - The device id is a v4 UUID in the caller's own localStorage. Claiming
 *     a stranger's anonymous events means guessing a UUID, and the prize
 *     for guessing is that their pre-signup page views become yours.
 *
 * Not granted to `anon`: there has to be somebody to claim them for.
 */
create or replace function public.claim_my_events(p_device text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  n  integer := 0;
begin
  -- A short or absent id is the storage-disabled fallback in analytics.js
  -- ("nostore-…"), which is per-page and not worth stitching.
  if me is null or p_device is null or length(p_device) < 20 then
    return 0;
  end if;

  update public.app_events
     set user_id = me
   where session_id = p_device
     and user_id is null;
  get diagnostics n = row_count;

  -- The same for what broke. A crash somebody met before signing up is the
  -- most interesting crash there is — it happened while they were deciding.
  update public.app_errors
     set user_id = me
   where session_id = p_device
     and user_id is null;

  return n;
end $$;

grant execute on function public.claim_my_events(text) to authenticated;

-- ── The 403 already on the floor ─────────────────────────────────────────
--
-- Everything before today, joined up once.
--
-- Only devices where exactly one person has ever signed in. A shared
-- laptop with two accounts on it has anonymous events that genuinely
-- cannot be attributed, and guessing would put one person's browsing in
-- another person's history — which is a worse failure than leaving them
-- anonymous, and an unfixable one once written.
with owner as (
  -- No min(uuid) in Postgres, and the `having` below guarantees there is
  -- exactly one to pick, so any pick is the right one.
  select session_id, (array_agg(distinct user_id))[1] as user_id
    from public.app_events
   where user_id is not null
   group by session_id
  having count(distinct user_id) = 1
)
update public.app_events e
   set user_id = o.user_id
  from owner o
 where e.session_id = o.session_id
   and e.user_id is null;

with owner as (
  -- No min(uuid) in Postgres, and the `having` below guarantees there is
  -- exactly one to pick, so any pick is the right one.
  select session_id, (array_agg(distinct user_id))[1] as user_id
    from public.app_events
   where user_id is not null
   group by session_id
  having count(distinct user_id) = 1
)
update public.app_errors x
   set user_id = o.user_id
  from owner o
 where x.session_id = o.session_id
   and x.user_id is null;

-- ── Reading one person's whole arrival ───────────────────────────────────

/**
 * Everything one hopper did, from before they had an account.
 *
 * Admin only, and by address rather than by id, because the question is
 * always asked as a name: "what has Vivien done?"
 *
 * `before_signup` is the column worth having. It is the difference between
 * "they signed up and did nothing" and "they spent nine minutes looking
 * first" — and until now the app could not tell those apart.
 */
create or replace function public.the_road_in(p_email text)
returns table (
  at            timestamptz,
  before_signup boolean,
  event         text,
  detail        jsonb,
  build         text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  who  uuid;
  born timestamptz;
begin
  if not public.is_admin() then
    raise exception 'no';
  end if;

  select u.id, u.created_at into who, born
    from auth.users u where lower(u.email) = lower(p_email);
  if who is null then
    return;
  end if;

  return query
    select e.created_at, e.created_at < born, e.event, e.detail, e.build
      from public.app_events e
     where e.user_id = who
        -- Anything on a device this person has ever been seen on, including
        -- the stretch before the account existed.
        or e.session_id in (select distinct session_id from public.app_events where user_id = who)
     order by e.created_at;
end $$;

grant execute on function public.the_road_in(text) to authenticated;
