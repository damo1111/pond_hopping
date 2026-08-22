-- An example nobody can read is not an example.
--
-- Being shown to visitors takes two flags and only one of them was ever
-- switched. `is_demo` says a trip is an example. `is_public` is what the row
-- policy actually reads — `is_public or owner_id = auth.uid() or
-- is_trip_member(id)` — and it defaults to false.
--
-- So the natural state for a freshly switched-on example was is_demo true,
-- is_public false: on the globe for the one person who owns it, invisible to
-- every visitor it was switched on for. Four examples "on" and a new arrival
-- meeting an empty globe, both true at once.
--
-- That is what happened to Rome. David: "on Rome drop it by default but I
-- thought I had the option as an admin to select which demos I can surface."
-- He did have the option. It was lying to him.
--
-- Two fixes here, and a third in the Account card that reads these.

-- 1. The invariant, held in the database rather than remembered at each call
--    site. Switching a trip on as an example publishes it, always, whichever
--    path did the switching — the admin card, a seed script, a migration.
--
--    Deliberately one-way: switching an example off does NOT unpublish it. A
--    trip can be a shopfront link without being an example, and quietly
--    killing a URL that is already out in the world because somebody stopped
--    using it as a demo would be a worse surprise than the one being fixed.
create or replace function public.guard_is_demo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.is_demo is distinct from old.is_demo and not public.is_admin() then
    new.is_demo := old.is_demo;
  end if;
  if new.is_demo then
    new.is_public := true;
  end if;
  return new;
end;
$function$;

create or replace function public.guard_new_is_demo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.is_demo and not public.is_admin() then
    new.is_demo := false;
  end if;
  if new.is_demo then
    new.is_public := true;
  end if;
  return new;
end;
$function$;

-- 2. Rome, left half-on. It was dropped by is_public months after being
--    switched on by is_demo, so it sat in exactly the state above.
--
--    The claim is set from app_config because guard_is_demo() silently
--    reverts an is_demo change for anybody is_admin() says no to — and a
--    migration replayed with no JWT is one of those. Without this the line
--    below would be a silent no-op, which is the same class of bug as the
--    one it is fixing.
do $$
declare
  admin_email text;
begin
  select trim(split_part(value, ',', 1)) into admin_email
  from public.app_config where key = 'admin_emails';

  if admin_email is null then
    raise notice 'no admin_emails configured; leaving is_demo alone';
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('email', admin_email)::text,
    true
  );
  update public.trips set is_demo = false where slug = 'rome-example';
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.trips where is_demo and not is_public;
  if n > 0 then
    raise exception 'still % example(s) nobody can read', n;
  end if;
  select count(*) into n from public.trips where is_demo;
  raise notice '% examples, all of them readable', n;
end $$;
