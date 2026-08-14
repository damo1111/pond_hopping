-- Every account was created with display_name null, including the ones that
-- arrived from Google or Apple already carrying a name. Nothing downstream
-- asked for it either: the "what shall we call you" step in AuthSheet is only
-- reachable from the emailed-code path, so an OAuth hopper stayed nameless.
--
-- Split out rather than inlined so it can be checked against real rows.
create or replace function public.name_from_provider(meta jsonb)
returns text language sql immutable
as $function$
  select nullif(trim(coalesce(
    nullif(meta->>'full_name', ''),
    -- Apple's raw shape on first authorisation, and it only ever comes once.
    nullif(trim(coalesce(meta->'name'->>'firstName', '') || ' ' ||
                coalesce(meta->'name'->>'lastName', '')), ''),
    -- A plain string `name` claim, but never a JSON object rendered as text.
    case when jsonb_typeof(meta->'name') = 'string' then nullif(meta->>'name', '') end,
    nullif(meta->>'preferred_username', '')
  )), '');
$function$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, public.name_from_provider(new.raw_user_meta_data));
  return new;
end;
$function$;
